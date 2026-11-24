import 'package:flutter/material.dart';

import '../core/notifications/task_center_service.dart';
import '../data/task_center_repository.dart';

class TaskCenterPage extends StatefulWidget {
  const TaskCenterPage({
    required this.service,
    super.key,
  });

  final TaskCenterService service;

  @override
  State<TaskCenterPage> createState() => _TaskCenterPageState();
}

class _TaskCenterPageState extends State<TaskCenterPage> {
  @override
  void initState() {
    super.initState();
    widget.service.refresh(playAlert: false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tugas & Notifikasi'),
        actions: [
          IconButton(
            tooltip: 'Periksa tugas terbaru',
            onPressed: widget.service.isLoading
                ? null
                : () => widget.service.refresh(playAlert: false),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: AnimatedBuilder(
        animation: widget.service,
        builder: (context, _) {
          final tasks = widget.service.tasks;
          return RefreshIndicator(
            onRefresh: () => widget.service.refresh(playAlert: false),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _TaskSummary(count: tasks.length, updatedAt: widget.service.lastUpdated),
                if (widget.service.isLoading && tasks.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(36),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (tasks.isEmpty)
                  const _EmptyTasks()
                else
                  ...tasks.map((task) => _TaskCard(task: task)),
                if (widget.service.warnings.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  ...widget.service.warnings.map(
                    (warning) => _WarningCard(message: warning),
                  ),
                ],
                if (widget.service.lastError != null)
                  _WarningCard(message: widget.service.lastError!),
                const SizedBox(height: 24),
                const Text(
                  'Pemeriksaan tugas berjalan saat Dahlia APK aktif di depan layar. '
                  'Notifikasi suara latar atau ketika aplikasi ditutup memerlukan layanan push yang belum tersedia pada backend saat ini.',
                  style: TextStyle(fontSize: 11, color: Color(0xFF65756F)),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _TaskSummary extends StatelessWidget {
  const _TaskSummary({required this.count, required this.updatedAt});

  final int count;
  final DateTime? updatedAt;

  @override
  Widget build(BuildContext context) {
    final updateLabel = updatedAt == null
        ? 'Belum diperiksa'
        : 'Diperiksa ${TimeOfDay.fromDateTime(updatedAt!).format(context)}';
    return Card(
      color: const Color(0xFFEAF2EF),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Icon(Icons.notifications_active_outlined,
                size: 30, color: Color(0xFF244C45)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$count tugas perlu ditindaklanjuti',
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                  Text(updateLabel,
                      style: const TextStyle(fontSize: 11, color: Color(0xFF65756F))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TaskCard extends StatelessWidget {
  const _TaskCard({required this.task});

  final DahliaTask task;

  @override
  Widget build(BuildContext context) {
    final date = task.createdAt == null
        ? 'Tanggal tidak tersedia'
        : MaterialLocalizations.of(context).formatShortDate(task.createdAt!);
    return Card(
      margin: const EdgeInsets.only(top: 10),
      child: Padding(
        padding: const EdgeInsets.all(15),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: task.priority
                    ? const Color(0xFFFFEEDB)
                    : const Color(0xFFEAF2EF),
                borderRadius: BorderRadius.circular(13),
              ),
              child: Icon(
                _icon(task.category),
                color: task.priority
                    ? const Color(0xFF9A5A15)
                    : const Color(0xFF244C45),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(task.title,
                            style: const TextStyle(fontWeight: FontWeight.w800)),
                      ),
                      if (task.priority)
                        const Icon(Icons.priority_high_rounded,
                            color: Color(0xFFB66B1B), size: 18),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(task.categoryLabel,
                      style: const TextStyle(
                          color: Color(0xFF2D7764),
                          fontSize: 11,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 5),
                  Text(task.detail,
                      style: const TextStyle(
                          fontSize: 12, color: Color(0xFF65756F))),
                  const SizedBox(height: 7),
                  Text('${task.projectName} · $date',
                      style: const TextStyle(
                          fontSize: 10, color: Color(0xFF87938E))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData _icon(String category) {
    switch (category) {
      case 'po_approval':
        return Icons.fact_check_outlined;
      case 'material_review':
        return Icons.inventory_2_outlined;
      case 'warehouse_receipt':
        return Icons.local_shipping_outlined;
      case 'finance_payment':
        return Icons.payments_outlined;
      case 'attendance_review':
        return Icons.groups_outlined;
      default:
        return Icons.notifications_none_rounded;
    }
  }
}

class _EmptyTasks extends StatelessWidget {
  const _EmptyTasks();

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.symmetric(vertical: 48, horizontal: 20),
        child: Column(
          children: [
            Icon(Icons.task_alt_rounded, size: 46, color: Color(0xFF7F938A)),
            SizedBox(height: 12),
            Text('Tidak ada tugas tertunda',
                style: TextStyle(fontWeight: FontWeight.w800)),
            SizedBox(height: 5),
            Text(
              'Tugas yang sesuai dengan permission akun akan muncul di sini.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: Color(0xFF65756F)),
            ),
          ],
        ),
      );
}

class _WarningCard extends StatelessWidget {
  const _WarningCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Card(
        color: const Color(0xFFFFF5E7),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Text(message,
              style: const TextStyle(fontSize: 11, color: Color(0xFF7A5826))),
        ),
      );
}
