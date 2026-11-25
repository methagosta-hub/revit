import 'package:cryptography/cryptography.dart';
import 'package:dahlia_field/core/offline/secure_outbox.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('FieldPayloadCipher', () {
    test('encrypts and decrypts queued JSON payloads', () async {
      final cipher = FieldPayloadCipher();
      final key = SecretKey(List<int>.filled(32, 19));
      const clearText = '{"project_id":"project-1","quantity":12.5}';

      final encrypted = await cipher.encryptText(clearText, key);
      final restored = await cipher.decryptText(encrypted, key);

      expect(restored, clearText);
      expect(encrypted.cipherText, isNot(clearText));
      expect(encrypted.nonce, isNotEmpty);
      expect(encrypted.mac, isNotEmpty);
    });

    test('rejects tampered ciphertext', () async {
      final cipher = FieldPayloadCipher();
      final key = SecretKey(List<int>.filled(32, 23));
      final encrypted = await cipher.encryptText('private field payload', key);
      final tampered = EncryptedPayload(
        cipherText: encrypted.cipherText.replaceRange(0, 1, 'A'),
        nonce: encrypted.nonce,
        mac: encrypted.mac,
      );

      await expectLater(
        cipher.decryptText(tampered, key),
        throwsA(anything),
      );
    });
  });
}
