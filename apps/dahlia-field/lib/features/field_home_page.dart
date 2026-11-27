import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/offline/secure_outbox.dart';
import '../core/notifications/task_center_service.dart';
import '../core/sync/field_sync_service.dart';
import '../core/theme/javawasthu_theme.dart';
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
      body: FutureBuilder<_HomeData>(
        future: _homeFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const _LoadingState();
          }
          if (snapshot.hasError) {
            return _ErrorState(
              message: snapshot.error.toString(),
              onRetry: _reloadHome,
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
          final roleLabel = isSubcontractor
              ? 'SUBKONTRAKTOR'
              : (roleLabels.isEmpty
                  ? 'PENGGUNA'
                  : roleLabels.join(' · ').toUpperCase());

          final hasFieldReport =
              data.access.hasPermission('execution.report.create') ||
                  data.access.hasAnyProjectPermission(
                    ['execution.report.create'],
                  );
          final hasAttendance =
              data.access.hasPermission('attendance.record') ||
                  data.access.hasAnyProjectPermission(['attendance.record']);
          final hasMaterialRequest =
              data.access.hasPermission('procurement.request.create') ||
                  data.access.hasAnyProjectPermission(
                    ['procurement.request.create'],
                  );
          final hasProcurementWorkspace = data.access.canCreatePurchaseOrder ||
              data.access.canApprovePurchaseOrder ||
              data.access.canReviewMaterialRequest;
          final hasDirectorMonitor =
              isDirector && data.access.hasPermission('project.read');
          final hasWarehouseWorkspace = data.access.canManageWarehouse ||
              data.access.canReceiveMaterial ||
              data.access.canIssueMaterial;
          final hasFinanceWorkspace =
              data.access.canReadFinance || data.access.canManagePayments;
          final hasDirectPurchaseWorkspace =
              data.access.canManageDirectPurchases;

          final modules = _buildModules(
            data: data,
            isSubcontractor: isSubcontractor,
            hasFieldReport: hasFieldReport,
            hasAttendance: hasAttendance,
            hasMaterialRequest: hasMaterialRequest,
            hasProcurementWorkspace: hasProcurementWorkspace,
            hasDirectorMonitor: hasDirectorMonitor,
            hasWarehouseWorkspace: hasWarehouseWorkspace,
            hasFinanceWorkspace: hasFinanceWorkspace,
            hasDirectPurchaseWorkspace: hasDirectPurchaseWorkspace,
          );

          return SafeArea(
            bottom: false,
            child: RefreshIndicator(
              color: JavawasthuPalette.teal,
              onRefresh: () async {
                await _sync.syncPending();
                await _reloadHome();
              },
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(0, 0, 0, 28),
                children: [
                  _BrandHeader(
                    name: name,
                    roleLabel: roleLabel,
                    pendingTasks: _taskCenter.pendingCount,
                    isSyncing: _sync.isSyncing,
                    onSync: isDirector ? _reloadHome : _sync.syncPending,
                    onTasks: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => TaskCenterPage(service: _taskCenter),
                      ),
                    ),
                    onSignOut: _signOut,
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 20, 18, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _ProjectOverview(
                          projects: data.projects,
                          isSubcontractor: isSubcontractor,
                          segmentCount: data.segments.length,
                        ),
                        const SizedBox(height: 14),
                        AnimatedBuilder(
                          animation: _sync,
                          builder: (context, _) => FutureBuilder<int>(
                            future: widget.outbox.pendingCount(
                              _repository.currentUserId,
                            ),
                            builder: (context, countSnapshot) {
                              return _SyncCard(
                                count: countSnapshot.data ?? 0,
                                isSyncing: _sync.isSyncing,
                                message: _sync.lastMessage,
                                onSync: _sync.syncPending,
                              );
                            },
                          ),
                        ),
                        const SizedBox(height: 26),
                        _SectionHeading(
                          title: 'Modul Kerja',
                          subtitle:
                              'Akses pekerjaan sesuai peran dan kewenangan akun.',
                          trailing: '${modules.length} modul',
                        ),
                        const SizedBox(height: 14),
                        if (modules.isNotEmpty)
                          _FeatureGrid(modules: modules)
                        else
                          const _InfoCard(
                            message:
                                'Belum ada modul APK yang aktif untuk permission akun ini. Modul lain dapat ditambahkan bertahap tanpa mengubah dashboard web atau database.',
                          ),
                        if (hasMaterialRequest &&
                            data.materialRequestProjectsError != null) ...[
                          const SizedBox(height: 14),
                          const _InfoCard(
                            message:
                                'Daftar proyek untuk permintaan material belum tersedia. Perbarui database Javawasthu Field sebelum menggunakan menu ini.',
                          ),
                        ],
                        if (hasMaterialRequest &&
                            data.materialRequestProjectsError == null &&
                            data.materialRequestProjects.isEmpty) ...[
                          const SizedBox(height: 14),
                          const _InfoCard(
                            message:
                                'Belum ada proyek berstatus DIKERJAKAN yang memiliki izin pengajuan material.',
                          ),
                        ],
                        if (isSubcontractor && data.segments.isEmpty) ...[
                          const SizedBox(height: 14),
                          const _InfoCard(
                            message:
                                'Belum ada kontrak aktif yang ditautkan ke akun ini.',
                          ),
                        ],
                        if (data.projects.isEmpty &&
                            (hasFieldReport || hasAttendance)) ...[
                          const SizedBox(height: 14),
                          const _InfoCard(
                            message:
                                'Belum ada proyek yang ditugaskan atau dapat diakses akun ini.',
                          ),
                        ],
                        const SizedBox(height: 18),
                        const _InfoCard(
                          icon: Icons.verified_user_outlined,
                          message:
                              'Setiap transaksi mengikuti alur verifikasi. Absensi diperiksa Personalia, permintaan material diproses Purchasing, dan pembayaran tetap melalui persetujuan Finance.',
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  List<_ModuleSpec> _buildModules({
    required _HomeData data,
    required bool isSubcontractor,
    required bool hasFieldReport,
    required bool hasAttendance,
    required bool hasMaterialRequest,
    required bool hasProcurementWorkspace,
    required bool hasDirectorMonitor,
    required bool hasWarehouseWorkspace,
    required bool hasFinanceWorkspace,
    required bool hasDirectPurchaseWorkspace,
  }) {
    final modules = <_ModuleSpec>[];

    if (hasProcurementWorkspace) {
      modules.add(_ModuleSpec(
        icon: Icons.shopping_cart_checkout_rounded,
        color: JavawasthuPalette.gold,
        title: 'Pengadaan & Purchasing',
        description:
            'Kelola Purchase Order dan tinjau permintaan material.',
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => ProcurementPage(
              repository: _procurementRepository,
              access: data.access,
            ),
          ),
        ).then((_) => _reloadHome()),
      ));
    }

    if (hasWarehouseWorkspace) {
      modules.add(_ModuleSpec(
        icon: Icons.warehouse_rounded,
        color: const Color(0xFF347D85),
        title: 'Operasional Gudang',
        description:
            'Pantau stok, penerimaan, pengeluaran, dan berita acara PDF.',
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => WarehousePage(
              repository: _warehouseRepository,
              access: data.access,
            ),
          ),
        ).then((_) => _reloadHome()),
      ));
    }

    if (hasFinanceWorkspace) {
      modules.add(_ModuleSpec(
        icon: Icons.account_balance_wallet_rounded,
        color: JavawasthuPalette.teal,
        title: 'Pusat Keuangan',
        description:
            'Kelola kas, pembayaran supplier, kewajiban, dan rekap PDF.',
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => FinancePage(
              repository: _financeRepository,
              access: data.access,
            ),
          ),
        ).then((_) => _reloadHome()),
      ));
    }

    if (hasDirectPurchaseWorkspace) {
      modules.add(_ModuleSpec(
        icon: Icons.shopping_bag_rounded,
        color: const Color(0xFFB37E32),
        title: 'Pembelian Material Langsung',
        description:
            'Catat belanja tanpa PO dengan stok dan kas dalam satu alur.',
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => DirectMaterialPurchasePage(
              repository: _directPurchaseRepository,
            ),
          ),
        ).then((_) => _reloadHome()),
      ));
    }

    if (hasDirectorMonitor) {
      modules.add(_ModuleSpec(
        icon: Icons.monitor_heart_outlined,
        color: JavawasthuPalette.deepTeal,
        title: 'Pemantauan Direktur',
        description:
            'Pantau proyek dan riwayat laporan harian dalam mode baca saja.',
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => DirectorMonitorPage(
              repository: _repository,
              projects: data.projects,
              onRefresh: _reloadHome,
            ),
          ),
        ),
      ));
    }

    if (isSubcontractor) {
      modules.add(_ModuleSpec(
        icon: Icons.stacked_line_chart_rounded,
        color: JavawasthuPalette.teal,
        title: 'Laporan Progres',
        description: 'Ajukan volume pekerjaan pada segmen kontrak Anda.',
        enabled: data.segments.isNotEmpty,
        onTap: () => _openSubcontractor(data.segments),
      ));
      modules.add(_ModuleSpec(
        icon: Icons.request_quote_outlined,
        color: JavawasthuPalette.gold,
        title: 'Permintaan Pembayaran',
        description:
            'Ajukan klaim dari progres disetujui atau termin kontrak.',
        enabled: data.segments.isNotEmpty,
        onTap: () => _openSubcontractor(data.segments, initialTab: 1),
      ));
    } else {
      if (hasFieldReport) {
        modules.add(_ModuleSpec(
          icon: Icons.assignment_turned_in_outlined,
          color: JavawasthuPalette.teal,
          title: 'Laporan Harian Proyek',
          description:
              'Catat aktivitas, volume pekerjaan, personel, material, dan kendala.',
          enabled: data.projects.isNotEmpty,
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => DailyReportPage(
                repository: _repository,
                sync: _sync,
                projects: data.projects,
              ),
            ),
          ),
        ));
      }

      if (hasAttendance) {
        modules.add(_ModuleSpec(
          icon: Icons.fact_check_outlined,
          color: const Color(0xFF347D85),
          title: 'Absensi Pekerja',
          description:
              'Catat kehadiran pekerja yang ditugaskan pada proyek.',
          enabled: data.projects.isNotEmpty,
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => AttendancePage(
                repository: _repository,
                sync: _sync,
                projects: data.projects,
              ),
            ),
          ),
        ));
      }

      if (hasMaterialRequest) {
        modules.add(_ModuleSpec(
          icon: Icons.inventory_2_outlined,
          color: JavawasthuPalette.gold,
          title: 'Permintaan Material',
          description:
              'Ajukan kebutuhan barang pada proyek yang sedang dikerjakan.',
          enabled: data.materialRequestProjects.isNotEmpty,
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => MaterialRequestPage(
                repository: _repository,
                sync: _sync,
                projects: data.materialRequestProjects,
              ),
            ),
          ),
        ));
      }
    }

    return modules;
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

class _BrandHeader extends StatelessWidget {
  const _BrandHeader({
    required this.name,
    required this.roleLabel,
    required this.pendingTasks,
    required this.isSyncing,
    required this.onSync,
    required this.onTasks,
    required this.onSignOut,
  });

  final String name;
  final String roleLabel;
  final int pendingTasks;
  final bool isSyncing;
  final VoidCallback onSync;
  final VoidCallback onTasks;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            JavawasthuPalette.deepTeal,
            Color(0xFF0D625B),
            Color(0xFF1D7669),
          ],
        ),
        borderRadius: BorderRadius.vertical(
          bottom: Radius.circular(28),
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -38,
            top: 18,
            child: Container(
              width: 164,
              height: 164,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.09),
                  width: 22,
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 25),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: JavawasthuPalette.gold,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(
                        Icons.apartment_rounded,
                        color: JavawasthuPalette.deepTeal,
                        size: 27,
                      ),
                    ),
                    const SizedBox(width: 9),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'JAVAWASTHU',
                            maxLines: 1,
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 15,
                              height: 1.1,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 1.1,
                            ),
                          ),
                          SizedBox(height: 3),
                          Text(
                            'MANAGEMENT',
                            maxLines: 1,
                            style: TextStyle(
                              color: Color(0xFFD9E9E3),
                              fontSize: 10,
                              height: 1.1,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 2.2,
                            ),
                          ),
                        ],
                      ),
                    ),
                    _HeaderAction(
                      icon: isSyncing
                          ? Icons.sync_rounded
                          : Icons.cloud_sync_outlined,
                      tooltip: 'Sinkronkan data',
                      onPressed: onSync,
                    ),
                    const SizedBox(width: 6),
                    _HeaderAction(
                      icon: Icons.notifications_none_rounded,
                      tooltip: 'Tugas dan notifikasi',
                      onPressed: onTasks,
                      badge: pendingTasks,
                    ),
                    const SizedBox(width: 6),
                    _HeaderAction(
                      icon: Icons.logout_rounded,
                      tooltip: 'Keluar',
                      onPressed: onSignOut,
                    ),
                  ],
                ),
                const SizedBox(height: 27),
                const Text(
                  'SELAMAT DATANG',
                  style: TextStyle(
                    color: Color(0xFFC5DED7),
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.7,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 25,
                    height: 1.15,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 11),
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.13),
                    borderRadius: BorderRadius.circular(30),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.13),
                    ),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 11,
                      vertical: 7,
                    ),
                    child: Text(
                      roleLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeaderAction extends StatelessWidget {
  const _HeaderAction({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.badge = 0,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;
  final int badge;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 36,
          height: 38,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              Icon(icon, color: Colors.white, size: 20),
              if (badge > 0)
                Positioned(
                  top: 1,
                  right: 0,
                  child: Container(
                    constraints: const BoxConstraints(
                      minWidth: 15,
                      minHeight: 15,
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    decoration: const BoxDecoration(
                      color: JavawasthuPalette.gold,
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      badge > 9 ? '9+' : '$badge',
                      style: const TextStyle(
                        color: JavawasthuPalette.ink,
                        fontSize: 8,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProjectOverview extends StatelessWidget {
  const _ProjectOverview({
    required this.projects,
    required this.isSubcontractor,
    required this.segmentCount,
  });

  final List<Map<String, dynamic>> projects;
  final bool isSubcontractor;
  final int segmentCount;

  @override
  Widget build(BuildContext context) {
    if (projects.isEmpty) {
      return const _InfoCard(
        icon: Icons.apartment_outlined,
        message:
            'Belum ada proyek yang tertaut pada akun ini. Modul yang membutuhkan proyek akan aktif setelah penugasan tersedia.',
      );
    }

    final project = projects.first;
    final title = _readText(
      project,
      ['title', 'project_name', 'name'],
      fallback: 'Proyek aktif',
    );
    final client = _readText(project, ['client', 'client_name']);
    final location = _readText(project, ['location', 'project_location']);
    final status = _readText(
      project,
      ['project_status', 'status'],
      fallback: 'Aktif',
    );
    final subtitle = [client, location]
        .where((value) => value.isNotEmpty)
        .join(' • ');

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(17),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: JavawasthuPalette.goldLight,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.apartment_rounded,
                    color: JavawasthuPalette.deepTeal,
                    size: 21,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    isSubcontractor ? 'KONTRAK TERKAIT' : 'PROYEK TERKAIT',
                    style: const TextStyle(
                      color: JavawasthuPalette.muted,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.1,
                    ),
                  ),
                ),
                _StatusPill(label: status),
              ],
            ),
            const SizedBox(height: 13),
            Text(
              title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            if (subtitle.isNotEmpty) ...[
              const SizedBox(height: 5),
              Text(
                subtitle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: 14),
            Row(
              children: [
                const Icon(
                  Icons.folder_open_outlined,
                  color: JavawasthuPalette.teal,
                  size: 17,
                ),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    isSubcontractor
                        ? '$segmentCount segmen kontrak tertaut'
                        : '${projects.length} proyek dapat diakses',
                    style: const TextStyle(
                      color: JavawasthuPalette.deepTeal,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                if (projects.length > 1)
                  const Icon(
                    Icons.arrow_forward_rounded,
                    color: JavawasthuPalette.teal,
                    size: 17,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: JavawasthuPalette.tealLight,
        borderRadius: BorderRadius.circular(30),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
        child: Text(
          label.toUpperCase(),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: JavawasthuPalette.deepTeal,
            fontSize: 9,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.4,
          ),
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
    final isPending = count > 0;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isPending
            ? JavawasthuPalette.goldLight
            : JavawasthuPalette.tealLight,
        borderRadius: BorderRadius.circular(17),
        border: Border.all(
          color: isPending
              ? const Color(0xFFEFE0BD)
              : const Color(0xFFD5E8E0),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.75),
              borderRadius: BorderRadius.circular(13),
            ),
            child: Icon(
              isSyncing
                  ? Icons.sync_rounded
                  : (isPending
                      ? Icons.cloud_upload_outlined
                      : Icons.cloud_done_outlined),
              color: isPending
                  ? const Color(0xFF9A6B2E)
                  : JavawasthuPalette.teal,
              size: 22,
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isSyncing
                      ? 'Menyinkronkan data'
                      : (isPending
                          ? '$count data menunggu dikirim'
                          : 'Semua data tersinkron'),
                  style: const TextStyle(
                    color: JavawasthuPalette.ink,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  message,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: JavawasthuPalette.muted,
                    fontSize: 10,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          IconButton(
            tooltip: 'Sinkronkan sekarang',
            onPressed: isSyncing ? null : onSync,
            icon: const Icon(Icons.refresh_rounded),
            color: JavawasthuPalette.deepTeal,
            style: IconButton.styleFrom(
              backgroundColor: Colors.white.withValues(alpha: 0.78),
              minimumSize: const Size(38, 38),
              padding: EdgeInsets.zero,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({
    required this.title,
    required this.subtitle,
    required this.trailing,
  });

  final String title;
  final String subtitle;
  final String trailing;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Text(
                title,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontSize: 21,
                    ),
              ),
            ),
            Text(
              trailing,
              style: const TextStyle(
                color: JavawasthuPalette.teal,
                fontSize: 10,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
        const SizedBox(height: 5),
        Text(
          subtitle,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _FeatureGrid extends StatelessWidget {
  const _FeatureGrid({required this.modules});

  final List<_ModuleSpec> modules;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final itemWidth = (constraints.maxWidth - 12) / 2;
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: modules.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: itemWidth / 184,
          ),
          itemBuilder: (context, index) => _FeatureCard(
            module: modules[index],
          ),
        );
      },
    );
  }
}

class _ModuleSpec {
  const _ModuleSpec({
    required this.icon,
    required this.color,
    required this.title,
    required this.description,
    required this.onTap,
    this.enabled = true,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String description;
  final VoidCallback onTap;
  final bool enabled;
}

class _FeatureCard extends StatelessWidget {
  const _FeatureCard({required this.module});

  final _ModuleSpec module;

  @override
  Widget build(BuildContext context) {
    final tint = module.color.withValues(alpha: 0.11);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: module.enabled ? module.onTap : null,
        child: Opacity(
          opacity: module.enabled ? 1 : 0.48,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: tint,
                        borderRadius: BorderRadius.circular(13),
                      ),
                      child: Icon(
                        module.icon,
                        color: module.color,
                        size: 23,
                      ),
                    ),
                    const Spacer(),
                    Icon(
                      module.enabled
                          ? Icons.arrow_outward_rounded
                          : Icons.lock_outline_rounded,
                      color: JavawasthuPalette.muted,
                      size: 16,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  module.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: JavawasthuPalette.ink,
                    fontSize: 13,
                    height: 1.22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 5),
                Expanded(
                  child: Text(
                    module.enabled
                        ? module.description
                        : 'Belum tersedia untuk proyek atau kontrak akun ini.',
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: JavawasthuPalette.muted,
                      fontSize: 10,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.message,
    this.icon = Icons.info_outline_rounded,
  });

  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: JavawasthuPalette.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: JavawasthuPalette.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: JavawasthuPalette.teal, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: JavawasthuPalette.muted,
                fontSize: 11,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LoadingState extends StatelessWidget {
  const _LoadingState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 34,
            height: 34,
            child: CircularProgressIndicator(strokeWidth: 3),
          ),
          SizedBox(height: 18),
          Text(
            'Menyiapkan Javawasthu Management',
            style: TextStyle(
              color: JavawasthuPalette.muted,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
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
    return SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 58,
                      height: 58,
                      decoration: BoxDecoration(
                        color: JavawasthuPalette.goldLight,
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: const Icon(
                        Icons.shield_outlined,
                        color: JavawasthuPalette.deepTeal,
                        size: 28,
                      ),
                    ),
                    const SizedBox(height: 17),
                    Text(
                      'Akun belum siap digunakan',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 7),
                    Text(
                      message,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      onPressed: onRetry,
                      icon: const Icon(Icons.refresh_rounded),
                      label: const Text('Coba lagi'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

String _readText(
  Map<String, dynamic> data,
  List<String> keys, {
  String fallback = '',
}) {
  for (final key in keys) {
    final value = data[key]?.toString().trim() ?? '';
    if (value.isNotEmpty) return value;
  }
  return fallback;
}
