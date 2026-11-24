import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/offline/secure_outbox.dart';
import '../core/notifications/task_center_service.dart';
import '../core/sync/field_sync_service.dart';
import '../data/dahlia_access.dart';
import '../data/field_repository.dart';
import '../data/procurement_repository.dart';
import '../data/task_center_repository.dart';
import '../data/warehouse_repository.dart';
import '../data/finance_repository.dart';
import '../data/direct_purchase_repository.dart';
import 'warehouse_page.dart';
import 'finance_page.dart';
import 'direct_material_purchase_page.dart';
import 'attendance_page.dart';
import 'material_request_page.dart';
import 'daily_report_page.dart';
import 'subcontractor_page.dart';
import 'director_monitor_page.dart';
import 'procurement_page.dart';
import 'task_center_page.dart';

class FieldHomePage extends StatefulWidget {
  const FieldHomePage({required this.outbox, super.key});

  final SecureOutbox outbox;

  @override
  State<FieldHomePage> createState() => _FieldHomePageState();
}

class _FieldHomePageState extends State<FieldHomePage>
    with WidgetsBindingObserver {
  late final FieldRepository _repository;
  late final ProcurementRepository _procurementRepository;
  late final WarehouseRepository _warehouseRepository;
  late final FinanceRepository _financeRepository;
  late final DirectMaterialPurchaseRepository _directPurchaseRepository;
  late final TaskCenterService _taskCenter;
  late final FieldSyncService _sync;
  late Future<_HomeData> _homeFuture;
  bool _syncStarted = false;
  bool _syncEnabled = false;
  bool _taskCenterStarted = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final client = Supabase.instance.client;
    _repository = FieldRepository(client: client, outbox: widget.outbox);
    _procurementRepository = ProcurementRepository(client: client);
    _warehouseRepository = WarehouseRepository(client: client);
    _financeRepository = FinanceRepository(client: client);
    _directPurchaseRepository = DirectMaterialPurchaseRepository(client: client);
    _taskCenter = TaskCenterService(
      repository: TaskCenterRepository(client: client),
    );
    _sync = FieldSyncService(client: client, outbox: widget.outbox);
    _homeFuture = _loadHome();
  }

  Future<_HomeData> _loadHome() async {
    final contextData = await _repository.getContext();
    final access = await _repository.getAccess();
    if (!_taskCenterStarted) {
      _taskCenterStarted = true;
      _taskCenter.start(access);
    }
    final isDirector = contextData['field_role'] == 'director';
    final isSubcontractor = contextData['field_role'] == 'subcontractor';
    _syncEnabled = !isDirector;
    if (_syncEnabled && !_syncStarted) {
      _syncStarted = true;
      _sync.start();
    }
    final projects = isDirector
        ? await _repository.listDirectorProjects()
        : await _repository.listProjects();
    var materialRequestProjects = <Map<String, dynamic>>[];
    String? materialRequestProjectsError;
    if (!isDirector && !isSubcontractor) {
      try {
        materialRequestProjects =
            await _repository.listMaterialRequestProjects();
      } catch (error) {
        // Keep the other field modules available while the database migration
        // is pending. Material requests remain disabled until the RPC exists.
        materialRequestProjectsError = error.toString();
      }
    }
    final segments = isSubcontractor
        ? await _repository.listMySegments()
        : <Map<String, dynamic>>[];
    return _HomeData(
      contextData: contextData,
      access: access,
      projects: projects,
      materialRequestProjects: materialRequestProjects,
      materialRequestProjectsError: materialRequestProjectsError,
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
      if (_syncEnabled) _sync.syncPending();
      _taskCenter.resume();
    } else if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      _taskCenter.pause();
    }
  }

  Future<void> _signOut() async {
    await Supabase.instance.client.auth.signOut();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _sync.dispose();
    _taskCenter.dispose();
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
          AnimatedBuilder(
            animation: _taskCenter,
            builder: (context, _) => IconButton(
              tooltip: 'Tugas & notifikasi',
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => TaskCenterPage(service: _taskCenter),
                ),
              ),
              icon: Stack(
                clipBehavior: Clip.none,
                children: [
                  const Icon(Icons.notifications_none_rounded),
                  if (_taskCenter.pendingCount > 0)
                    Positioned(
                      right: -7,
                      top: -6,
                      child: Container(
                        padding: const EdgeInsets.all(3),
                        decoration: const BoxDecoration(
                          color: Color(0xFFC94C43),
                          shape: BoxShape.circle,
                        ),
                        constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                        child: Text(
                          _taskCenter.pendingCount > 9 ? '9+' : '${_taskCenter.pendingCount}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 8,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
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
          final name = data.access.fullName.isNotEmpty
              ? data.access.fullName
              : (data.contextData['full_name'] as String? ?? 'Pengguna');
          final roleLabels = data.access.roleCodes.map(dahliaRoleLabel).toList();
          final hasFieldReport = data.access.hasPermission('execution.report.create') ||
              data.access.hasAnyProjectPermission(['execution.report.create']);
          final hasAttendance = data.access.hasPermission('attendance.record') ||
              data.access.hasAnyProjectPermission(['attendance.record']);
          final hasMaterialRequest = data.access.hasPermission('procurement.request.create') ||
              data.access.hasAnyProjectPermission(['procurement.request.create']);
          final hasProcurementWorkspace = data.access.canCreatePurchaseOrder ||
              data.access.canApprovePurchaseOrder ||
              data.access.canReviewMaterialRequest;
          final hasDirectorMonitor = isDirector && data.access.hasPermission('project.read');
          final hasWarehouseWorkspace = data.access.canManageWarehouse || data.access.canReceiveMaterial || data.access.canIssueMaterial;
          final hasFinanceWorkspace = data.access.canReadFinance || data.access.canManagePayments;
          final hasDirectPurchaseWorkspace = data.access.canManageDirectPurchases;

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
                      : 'Ruang kerja sesuai kewenangan akun Dahlia',
                  roleLabel: isSubcontractor
                      ? 'SUBKONTRAKTOR'
                      : (roleLabels.isEmpty ? 'PENGGUNA DAHLIA' : roleLabels.join(' · ').toUpperCase()),
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
                  'Ruang kerja saya',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 12),
                if (hasProcurementWorkspace) ...[
                  _FeatureCard(
                    icon: Icons.shopping_cart_checkout_rounded,
                    title: 'Pengadaan & Purchasing',
                    description: 'Kelola Purchase Order dan tinjau permintaan material sesuai permission akun.',
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => ProcurementPage(
                          repository: _procurementRepository,
                          access: data.access,
                        ),
                      ),
                    ).then((_) => _reloadHome()),
                  ),
                  const SizedBox(height: 10),
                ],
                if (hasWarehouseWorkspace) ...[
                  _FeatureCard(
                    icon: Icons.warehouse_rounded,
                    color: const Color(0xFF2F7190),
                    title: 'Operasional Gudang',
                    description: 'Pantau stok, catat penerimaan dan pengeluaran, serta buat berita acara PDF.',
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => WarehousePage(
                          repository: _warehouseRepository,
                          access: data.access,
                        ),
                      ),
                    ).then((_) => _reloadHome()),
                  ),
                  const SizedBox(height: 10),
                ],
                if (hasFinanceWorkspace) ...[
                  _FeatureCard(
                    icon: Icons.account_balance_wallet_rounded,
                    color: const Color(0xFF23835F),
                    title: 'Pusat Keuangan',
                    description: 'Kelola kas, pembayaran supplier, kewajiban, ringkasan proyek, dan rekap PDF.',
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => FinancePage(
                          repository: _financeRepository,
                          access: data.access,
                        ),
                      ),
                    ).then((_) => _reloadHome()),
                  ),
                  const SizedBox(height: 10),
                ],
                if (hasDirectPurchaseWorkspace) ...[
                  _FeatureCard(
                    icon: Icons.shopping_bag_rounded,
                    color: const Color(0xFF9A6B2E),
                    title: 'Pembelian Material Langsung',
                    description: 'Catat belanja material tanpa PO; stok dan kas terhubung dalam satu transaksi.',
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => DirectMaterialPurchasePage(
                          repository: _directPurchaseRepository,
                        ),
                      ),
                    ).then((_) => _reloadHome()),
                  ),
                  const SizedBox(height: 10),
                ],
                if (hasDirectorMonitor) ...[
                  _FeatureCard(
                    icon: Icons.monitor_heart_outlined,
                    title: 'Pemantauan Direktur',
                    description: 'Pantau seluruh proyek dan riwayat laporan harian secara baca saja.',
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => DirectorMonitorPage(
                          repository: _repository,
                          projects: data.projects,
                          onRefresh: _reloadHome,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                ],
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
                  if (hasFieldReport)
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
                  if (hasAttendance) ...[
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
                  ],
                  if (hasMaterialRequest) ...[
                  const SizedBox(height: 10),
                  _FeatureCard(
                    icon: Icons.inventory_2_outlined,
                    title: 'Permintaan material',
                    description: 'Ajukan kebutuhan barang pada proyek yang sedang dikerjakan.',
                    onTap: data.materialRequestProjects.isEmpty
                        ? null
                        : () => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => MaterialRequestPage(
                                  repository: _repository,
                                  sync: _sync,
                                  projects: data.materialRequestProjects,
                                ),
                              ),
                            ),
                  ),
                  ],
                  if (hasMaterialRequest && data.materialRequestProjectsError != null)
                    const _InfoCard(
                      message: 'Daftar proyek untuk permintaan material belum tersedia. Perbarui database Dahlia Field sebelum menggunakan menu ini.',
                    ),
                  if (hasMaterialRequest && data.materialRequestProjectsError == null &&
                      data.materialRequestProjects.isEmpty)
                    const _InfoCard(
                      message: 'Belum ada proyek berstatus DIKERJAKAN yang memiliki izin pengajuan material.',
                    ),
                  if (!hasFieldReport && !hasAttendance && !hasMaterialRequest && !hasProcurementWorkspace && !hasWarehouseWorkspace && !hasFinanceWorkspace && !hasDirectPurchaseWorkspace && !hasDirectorMonitor)
                    const _InfoCard(
                      message: 'Belum ada modul APK yang aktif untuk permission akun ini. Modul lain akan ditambahkan bertahap tanpa perubahan dashboard atau database.',
                    ),
                  if (data.projects.isEmpty && (hasFieldReport || hasAttendance))
                    const _InfoCard(
                      message: 'Belum ada proyek yang ditugaskan atau dapat diakses akun ini.',
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
    required this.access,
    required this.projects,
    required this.materialRequestProjects,
    required this.materialRequestProjectsError,
    required this.segments,
  });

  final Map<String, dynamic> contextData;
  final DahliaAccess access;
  final List<Map<String, dynamic>> projects;
  final List<Map<String, dynamic>> materialRequestProjects;
  final String? materialRequestProjectsError;
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
    this.color = const Color(0xFF244C45),
  });

  final IconData icon;
  final String title;
  final String description;
  final VoidCallback? onTap;
  final Color color;

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
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(icon, color: color, size: 23),
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
