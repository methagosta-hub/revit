import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path/path.dart' as path;
import 'package:sqflite/sqflite.dart';

class EncryptedPayload {
  const EncryptedPayload({
    required this.cipherText,
    required this.nonce,
    required this.mac,
  });

  final String cipherText;
  final String nonce;
  final String mac;
}

class FieldPayloadCipher {
  FieldPayloadCipher() : _algorithm = AesGcm.with256bits();

  final AesGcm _algorithm;

  Future<EncryptedPayload> encryptText(String value, SecretKey key) async {
    final box = await _algorithm.encrypt(
      utf8.encode(value),
      secretKey: key,
    );
    return EncryptedPayload(
      cipherText: base64Encode(box.cipherText),
      nonce: base64Encode(box.nonce),
      mac: base64Encode(box.mac.bytes),
    );
  }

  Future<String> decryptText(EncryptedPayload payload, SecretKey key) async {
    final clearBytes = await _algorithm.decrypt(
      SecretBox(
        base64Decode(payload.cipherText),
        nonce: base64Decode(payload.nonce),
        mac: Mac(base64Decode(payload.mac)),
      ),
      secretKey: key,
    );
    return utf8.decode(clearBytes);
  }
}

class FieldOperation {
  const FieldOperation({
    required this.operationId,
    required this.action,
    required this.payload,
  });

  final String operationId;
  final String action;
  final Map<String, dynamic> payload;
}

class SecureOutbox {
  SecureOutbox({
    FlutterSecureStorage? secureStorage,
    FieldPayloadCipher? cipher,
  })  : _secureStorage = secureStorage ?? const FlutterSecureStorage(),
        _cipher = cipher ?? FieldPayloadCipher();

  static const String _keyName = 'dahlia_field_aes_256_key_v1';
  final FlutterSecureStorage _secureStorage;
  final FieldPayloadCipher _cipher;
  Database? _database;
  Future<SecretKey>? _keyFuture;

  Future<void> initialize() async {
    await _databaseOrOpen();
    await _encryptionKey();
  }

  Future<Database> _databaseOrOpen() async {
    if (_database != null) return _database!;
    final databaseRoot = await getDatabasesPath();
    final databasePath = path.join(databaseRoot, 'dahlia_field.db');
    _database = await openDatabase(
      databasePath,
      version: 1,
      onConfigure: (db) async {
        await db.execute('PRAGMA foreign_keys = ON');
      },
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE field_outbox (
            operation_id TEXT PRIMARY KEY,
            owner_user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            cipher_text TEXT NOT NULL,
            nonce TEXT NOT NULL,
            mac TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        ''');
        await db.execute('''
          CREATE INDEX field_outbox_owner_status_idx
          ON field_outbox(owner_user_id, status, created_at)
        ''');
        await db.execute('''
          CREATE TABLE field_cache (
            cache_key TEXT PRIMARY KEY,
            cipher_text TEXT NOT NULL,
            nonce TEXT NOT NULL,
            mac TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        ''');
      },
    );
    return _database!;
  }

  Future<SecretKey> _encryptionKey() {
    return _keyFuture ??= _loadOrCreateKey();
  }

  Future<SecretKey> _loadOrCreateKey() async {
    final saved = await _secureStorage.read(key: _keyName);
    if (saved != null && saved.isNotEmpty) {
      final bytes = base64Decode(saved);
      if (bytes.length != 32) {
        throw StateError('Kunci enkripsi Dahlia Field tidak valid. Data lokal perlu dipulihkan.');
      }
      return SecretKey(bytes);
    }

    final key = await _cipher._algorithm.newSecretKey();
    final bytes = await key.extractBytes();
    await _secureStorage.write(key: _keyName, value: base64Encode(bytes));
    return SecretKey(bytes);
  }

  Future<void> enqueue({
    required String operationId,
    required String ownerUserId,
    required String action,
    required Map<String, dynamic> payload,
  }) async {
    if (operationId.isEmpty || ownerUserId.isEmpty || action.isEmpty) {
      throw ArgumentError('Identitas operasi, pengguna, dan tindakan wajib diisi.');
    }
    final db = await _databaseOrOpen();
    final key = await _encryptionKey();
    final encrypted = await _cipher.encryptText(jsonEncode(payload), key);
    final now = DateTime.now().toUtc().toIso8601String();

    await db.insert(
      'field_outbox',
      {
        'operation_id': operationId,
        'owner_user_id': ownerUserId,
        'action': action,
        'cipher_text': encrypted.cipherText,
        'nonce': encrypted.nonce,
        'mac': encrypted.mac,
        'status': 'pending',
        'attempts': 0,
        'created_at': now,
        'updated_at': now,
      },
      conflictAlgorithm: ConflictAlgorithm.abort,
    );
  }

  Future<List<FieldOperation>> pendingOperations(String ownerUserId) async {
    final db = await _databaseOrOpen();
    final key = await _encryptionKey();
    final rows = await db.query(
      'field_outbox',
      where: 'owner_user_id = ? AND status IN (?, ?)',
      whereArgs: [ownerUserId, 'pending', 'failed'],
      orderBy: 'created_at ASC',
      limit: 100,
    );

    final operations = <FieldOperation>[];
    for (final row in rows) {
      final encrypted = EncryptedPayload(
        cipherText: row['cipher_text']! as String,
        nonce: row['nonce']! as String,
        mac: row['mac']! as String,
      );
      final decoded = await _cipher.decryptText(encrypted, key);
      final payload = Map<String, dynamic>.from(jsonDecode(decoded) as Map);
      operations.add(
        FieldOperation(
          operationId: row['operation_id']! as String,
          action: row['action']! as String,
          payload: payload,
        ),
      );
    }
    return operations;
  }

  Future<int> pendingCount(String ownerUserId) async {
    final db = await _databaseOrOpen();
    final result = await db.rawQuery(
      '''
      SELECT COUNT(*) AS count
      FROM field_outbox
      WHERE owner_user_id = ? AND status IN ('pending', 'failed')
      ''',
      [ownerUserId],
    );
    return Sqflite.firstIntValue(result) ?? 0;
  }

  Future<void> markSynced(String operationId) async {
    final db = await _databaseOrOpen();
    final now = DateTime.now().toUtc().toIso8601String();
    await db.update(
      'field_outbox',
      {'status': 'synced', 'last_error': null, 'updated_at': now},
      where: 'operation_id = ?',
      whereArgs: [operationId],
    );
  }

  Future<void> markFailed(String operationId, Object error) async {
    final db = await _databaseOrOpen();
    final rows = await db.query(
      'field_outbox',
      columns: ['attempts'],
      where: 'operation_id = ?',
      whereArgs: [operationId],
      limit: 1,
    );
    final attempts = rows.isEmpty ? 1 : (rows.first['attempts']! as int) + 1;
    final errorText = error.toString();
    await db.update(
      'field_outbox',
      {
        'status': 'failed',
        'attempts': attempts,
        'last_error': errorText.substring(0, errorText.length > 500 ? 500 : errorText.length),
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'operation_id = ?',
      whereArgs: [operationId],
    );
  }

  Future<void> putEncryptedCache(String cacheKey, Map<String, dynamic> value) async {
    final db = await _databaseOrOpen();
    final key = await _encryptionKey();
    final encrypted = await _cipher.encryptText(jsonEncode(value), key);
    await db.insert(
      'field_cache',
      {
        'cache_key': cacheKey,
        'cipher_text': encrypted.cipherText,
        'nonce': encrypted.nonce,
        'mac': encrypted.mac,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<Map<String, dynamic>?> getEncryptedCache(String cacheKey) async {
    final db = await _databaseOrOpen();
    final key = await _encryptionKey();
    final rows = await db.query(
      'field_cache',
      where: 'cache_key = ?',
      whereArgs: [cacheKey],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    final row = rows.first;
    final clearText = await _cipher.decryptText(
      EncryptedPayload(
        cipherText: row['cipher_text']! as String,
        nonce: row['nonce']! as String,
        mac: row['mac']! as String,
      ),
      key,
    );
    return Map<String, dynamic>.from(jsonDecode(clearText) as Map);
  }

  Future<void> close() async {
    await _database?.close();
    _database = null;
  }
}
