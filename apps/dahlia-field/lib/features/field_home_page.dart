import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/offline/secure_outbox.dart';
import '../core/sync/field_sync_service.dart';
import '../data/field_repository.dart';
import 'attendance_page.dart';
import 'material_request_page.dart';
import 'daily_report_page.dart';
import 'subcontractor_page.dart';
import 'director_monitor_page.dart';

class FieldHomePage extends StatefulWidget {
  const FieldHomePage({required this.outbox, super.key});

  final SecureOutbox outbox;

  @override
  State<FieldHomePage> createState() => _FieldHomePageState();
}

class _FieldHomePageState extends State<FieldHomePage>
    with WidgetsBindingObserver {
  late final FieldRepository _repository;
  late final FieldSyncService _sync;
  late Future<_HomeData> _homeFuture;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final client = Supabase.instance.client;
    _repository = FieldRepository(client: client, outbox: widget.outbox);
    _sync = FieldSyncService(client: client, outbox: widget.outbox)..start();
    _homeFuture = _loadHome();
  }

  Future<_HomeData> _loadHome() async {
    final contextData = await _repository.getContext();
    final isDirector = contextData['field_role'] == 'director';
    final isSubcontractor = contextData['field_role'] == 'subcontractor';
    final projects = isDirector
        ? await _repository.listDirectorProjects()
        : await _repository.listProjects();
    final segments = isSubcontractor
        ? await _repository.listMySegments()
        : <Map<String, dynamic>>[];
    return _HomeData(
      contextData: contextData,
      projects: projects,
      segments: segments,
    );
  }

  Future<void> _reloadHome() async {
    final next = _loadHome();
    setState(() => _homeFuture = next);
    await next;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _sync.syncPending();
    }
  }

  Future<void> _signOut() async {
    await Supabase.instance.client.auth.signOut();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _sync.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Dahlia Field',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        actions: [
          FutureBuilder<_HomeData>(
            future: _homeFuture,
            builder: (context, snapshot) {
              if (!snapshot.hasData) return const SizedBox.shrink();
              final isDirector =
                  snapshot.data!.contextData['field_role'] == 'director';
              return IconButton(
                tooltip: isDirector ? 'Perbarui pemantauan' : 'Sinkronkan data',
                onPressed: isDirector
                    ? _reloadHome
                    : (_sync.isSyncing ? null : _sync.syncPending),
                icon: Icon(isDirector ? Icons.refresh_rounded : Icons.sync_rounded),
              );
            },
          ),
          IconButton(
            tooltip: 'Keluar',
            onPressed: _signOut,
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: FutureBuilder<_HomeData>(
        future: _homeFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _ErrorState(
              message: snapshot.error.toString(),
              onRetry: () => setState(() => _homeFuture = _loadHome()),
            );
          }

          final data = snapshot.data!;
          final role = data.contextData['field_role'] as String? ?? 'internal';
          final isSubcontractor = role == 'subcontractor';
          final isDirector = role == 'director';
          final name = data.contextData['full_name'] as String? ?? 'Pengguna';

          if (isDirector) {
            return DirectorMonitorPage(
              repository: _repository,
              projects: data.projects,
              onRefresh: _reloadHome,
            );
          }

          return RefreshIndicator(
            onRefresh: () async {
              await _sync.syncPending();
              await _reloadHome();
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 28),
              children: [
                _WelcomeCard(
                  name: name,
                  subtitle: isSubcontractor
                      ? 'Portal mitra pelaksana pekerjaan'
                      : 'Operasional proyek dan tim lapangan',
                  roleLabel: isSubcontractor ? 'SUBKONTRAKTOR' : 'TIM INTERNAL',
                ),
                const SizedBox(height: 14),
                AnimatedBuilder(
                  animation: _sync,
                  builder: (context, _) => FutureBuilder<int>(
                    future: widget.outbox.pendingCount(_repository.currentUserId),
                    builder: (context, countSnapshot) {
                      final count = countSnapshot.data ?? 0;
                      return _SyncCard(
                        count: count,
                        isSyncing: _sync.isSyncing,
                        message: _sync.lastMessage,
                        onSync: _sync.syncPending,
                      );
                    },
                  ),
                ),
                const SizedBox(height: 24),
                const Text(
                  'Menu lapangan',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 12),
                if (isSubcontractor) ...[
                  _FeatureCard(
                    icon: Icons.stacked_line_chart_rounded,
                    title: 'Laporan progres',
                    description: 'Ajukan volume pekerjaan pada segmen kontrak Anda.',
                    onTap: data.segments.isEmpty
                        ? null
                        : () => _openSubcontractor(data.segments),
                  ),
                  const SizedBox(height: 10),
                  _FeatureCard(
                    icon: Icons.request_quote_outlined,
                    title: 'Permintaan pembayaran',
                    description: 'Ajukan klaim berdasarkan progres disetujui atau termin.',
                    onTap: data.segments.isEmpty
                        ? null
                        : () => _openSubcontractor(data.segments, initialTab: 1),
                  ),
                  if (data.segments.isEmpty)
                    const _InfoCard(
                      message: 'Belum ada kontrak aktif yang ditautkan ke akun ini.',
                    ),
                ] else ...[
                  _FeatureCard(
                    icon: Icons.assignment_turned_in_outlined,
                    title: 'Laporan harian proyek',
                    description: 'Catat aktivitas, volume pekerjaan, personel, material, peralatan, cuaca, dan kendala.',
                    onTap: data.projects.isEmpty
                        ? null
                        : () => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => DailyReportPage(
                                  repository: _repository,
                                  sync: _sync,
                                  projects: data.projects,
                                ),
                              ),
                            ),
                  ),
                  const SizedBox(height: 10),
                  _FeatureCard(
                    icon: Icons.fact_check_outlined,
                    title: 'Absensi pekerja',
                    description: 'Catat kehadiran pekerja yang ditugaskan pada proyek.',
                    onTap: data.projects.isEmpty
                        ? null
                        : () => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => AttendancePage(
                                  repository: _repository,
                                  sync: _sync,
                                  projects: data.projects,
                                ),
                              ),
                            ),
                  ),
                  const SizedBox(height: 10),
                  _FeatureCard(
                    icon: Icons.inventory_2_outlined,
                    title: 'Permintaan material',
                    description: 'Ajukan kebutuhan barang untuk ditinjau Purchasing.',
                    onTap: data.projects.isEmpty
                        ? null
                        : () => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => MaterialRequestPage(
                                  repository: _repository,
                                  sync: _sync,
                                  projects: data.projects,
                                ),
                              ),
                            ),
                  ),
                  if (data.projects.isEmpty)
                    const _InfoCard(
                      message: 'Belum ada proyek dengan hak akses lapangan pada akun ini.',
                    ),
                ],
                const SizedBox(height: 24),
                const _InfoCard(
                  message: 'Kiriman lapangan tidak otomatis menyetujui transaksi. '
                      'Absensi tetap diverifikasi Personalia, PR diproses Purchasing, '
                      'dan pembayaran tetap melalui persetujuan Finance.',
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  void _openSubcontractor(
    List<Map<String, dynamic>> segments, {
    int initialTab = 0,
  }) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SubcontractorPage(
          repository: _repository,
          sync: _sync,
          segments: segments,
          initialTab: initialTab,
        ),
      ),
    );
  }
}

class _HomeData {
  const _HomeData({
    required this.contextData,
    required this.projects,
    required this.segments,
  });

  final Map<String, dynamic> contextData;
  final List<Map<String, dynamic>> projects;
  final List<Map<String, dynamic>> segments;
}

class _WelcomeCard extends StatelessWidget {
  const _WelcomeCard({
    required this.name,
    required this.subtitle,
    required this.roleLabel,
  });

  final String name;
  final String subtitle;
  final String roleLabel;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFF244C45),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              roleLabel,
              style: const TextStyle(
                color: Color(0xFFC5DDD3),
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 1,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Halo, $name',
              style: const TextStyle(
                fontSize: 23,
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 5),
            Text(
              subtitle,
              style: const TextStyle(color: Color(0xFFE0ECE7)),
            ),
          ],
        ),
      ),
    );
  }
}

class _SyncCard extends StatelessWidget {
  const _SyncCard({
    required this.count,
    required this.isSyncing,
    required this.message,
    required this.onSync,
  });

  final int count;
  final bool isSyncing;
  final String message;
  final VoidCallback onSync;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(
              isSyncing ? Icons.sync : Icons.cloud_done_outlined,
              color: const Color(0xFF2D7764),
              size: 28,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    count == 0 ? 'Data tersinkron' : '$count data menunggu',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    message,
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF677871),
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Coba sinkronkan',
              onPressed: isSyncing ? null : onSync,
              icon: const Icon(Icons.refresh_rounded),
            ),
          ],
        ),
      ),
    );
  }
}

class _FeatureCard extends StatelessWidget {
  const _FeatureCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String description;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(17),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: const Color(0xFFE5EFEB),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: const Color(0xFF244C45)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text(
                      description,
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF6E7D77),
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(15),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.info_outline, color: Color(0xFF52746A)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(
                  color: Color(0xFF62736D),
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.lock_outline, size: 42),
            const SizedBox(height: 12),
            const Text(
              'Akun belum siap digunakan',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Coba lagi'),
            ),
          ],
        ),
      ),
    );
  }
}
