import 'package:flutter/material.dart';

import '../data/field_repository.dart';

class DirectorMonitorPage extends StatelessWidget {
  const DirectorMonitorPage({
    required this.repository,
    required this.projects,
    required this.onRefresh,
    super.key,
  });

  final FieldRepository repository;
  final List<Map<String, dynamic>> projects;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final reportTotal = projects.fold<int>(
      0,
      (total, project) =>
          total + ((project['daily_report_count'] as num?)?.toInt() ?? 0),
    );
    final reportingProjects =
        projects.where((p) => p['last_report_date'] != null).length;

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Card(
            color: const Color(0xFF244C45),
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'PEMANTAUAN DIREKTUR',
                    style: TextStyle(
                      color: Color(0xFFC5DDD3),
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      _Metric('$projectCount', 'Proyek'),
                      _Metric('$reportingProjects', 'Ada laporan'),
                      _Metric('$reportTotal', 'Total laporan'),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          const Text(
            'Pemantauan seluruh proyek',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          const Text(
            'Mode baca saja — tidak ada fitur input atau perubahan data untuk akun Director.',
            style: TextStyle(color: Color(0xFF687A73), fontSize: 12),
          ),
          const SizedBox(height: 12),
          if (projects.isEmpty)
            const _EmptyState('Belum ada data proyek yang dapat ditampilkan.'),
          ...projects.map((project) => _ProjectCard(
                project: project,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => DirectorDailyReportsPage(
                      repository: repository,
                      project: project,
                    ),
                  ),
                ),
              )),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric(this.value, this.label);

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 3),
            Text(label, style: const TextStyle(color: Colors.white, fontSize: 11)),
          ],
        ),
      );
}

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({required this.project, required this.onTap});

  final Map<String, dynamic> project;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final title = (project['title'] as String?) ?? 'Proyek tanpa nama';
    final client = (project['client'] as String?) ?? '';
    final location = (project['location'] as String?) ?? '';
    final status = (project['project_status'] as String?) ?? '-';
    final reports = (project['daily_report_count'] as num?)?.toInt() ?? 0;
    final sent = (project['submitted_report_count'] as num?)?.toInt() ?? 0;
    final lastDate = _dateLabel(project['last_report_date']);
    final summary = (project['last_work_summary'] as String?) ?? '';

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.apartment_rounded, color: Color(0xFF356D5F)),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Text(title,
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                  const Icon(Icons.chevron_right_rounded),
                ],
              ),
              if (client.isNotEmpty || location.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  [client, location].where((s) => s.isNotEmpty).join(' • '),
                  style: const TextStyle(fontSize: 12, color: Color(0xFF687A73)),
                ),
              ],
              const SizedBox(height: 11),
              Wrap(
                spacing: 7,
                runSpacing: 7,
                children: [
                  _Tag('Status: $status'),
                  _Tag('$reports laporan'),
                  _Tag('$sent terkirim'),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                lastDate == '—' ? 'Belum ada laporan harian' : 'Laporan terakhir: $lastDate',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
              ),
              if (summary.trim().isNotEmpty) ...[
                const SizedBox(height: 5),
                Text(
                  summary,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: Color(0xFF687A73)),
                ),
              ],
              const SizedBox(height: 10),
              const Align(
                alignment: Alignment.centerRight,
                child: Text(
                  'Lihat riwayat laporan',
                  style: TextStyle(
                    color: Color(0xFF2D7764),
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
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

class DirectorDailyReportsPage extends StatelessWidget {
  const DirectorDailyReportsPage({
    required this.repository,
    required this.project,
    super.key,
  });

  final FieldRepository repository;
  final Map<String, dynamic> project;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          (project['title'] as String?) ?? 'Riwayat laporan',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: repository.listDirectorDailyReports(
          project['project_id'].toString(),
        ),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) return _EmptyState(snapshot.error.toString());
          final reports = snapshot.data ?? [];
          if (reports.isEmpty) {
            return const _EmptyState('Belum ada laporan harian untuk proyek ini.');
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: reports.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) => _ReportCard(report: reports[index]),
          );
        },
      ),
    );
  }
}

class _ReportCard extends StatelessWidget {
  const _ReportCard({required this.report});

  final Map<String, dynamic> report;

  @override
  Widget build(BuildContext context) {
    final number = (report['report_number'] as String?) ?? 'Laporan harian';
    final date = _dateLabel(report['report_date']);
    final status = _statusLabel(report['status'] as String?);
    final weather = (report['weather'] as String?) ?? '';
    final foreman = (report['foreman_name'] as String?) ?? '';
    final summary = (report['work_summary'] as String?) ?? '';
    final obstacles = (report['obstacles'] as String?) ?? '';
    final followUp = (report['follow_up'] as String?) ?? '';
    final labor = (report['labor_count'] as num?)?.toInt() ?? 0;
    final materials = (report['material_count'] as num?)?.toInt() ?? 0;
    final equipment = (report['equipment_count'] as num?)?.toInt() ?? 0;
    final workItems = (report['work_item_count'] as num?)?.toInt() ?? 0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(number,
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
                _Tag(status),
              ],
            ),
            const SizedBox(height: 5),
            Text(
              [
                date,
                if (weather.isNotEmpty) 'Cuaca: $weather',
                if (foreman.isNotEmpty) 'Pelapor: $foreman',
              ].join(' • '),
              style: const TextStyle(fontSize: 12, color: Color(0xFF687A73)),
            ),
            const SizedBox(height: 12),
            Text(summary.isEmpty ? 'Tidak ada ringkasan pekerjaan.' : summary),
            if (obstacles.isNotEmpty) ...[
              const SizedBox(height: 8),
              const Text('Kendala', style: TextStyle(fontWeight: FontWeight.w800)),
              Text(obstacles),
            ],
            if (followUp.isNotEmpty) ...[
              const SizedBox(height: 8),
              const Text('Tindak lanjut',
                  style: TextStyle(fontWeight: FontWeight.w800)),
              Text(followUp),
            ],
            const Divider(height: 22),
            Wrap(
              spacing: 7,
              runSpacing: 7,
              children: [
                _Tag('$workItems item pekerjaan'),
                _Tag('$labor personel'),
                _Tag('$materials material'),
                _Tag('$equipment peralatan'),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          color: const Color(0xFFE7F0EC),
          borderRadius: BorderRadius.circular(24),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Text(
            label,
            style: const TextStyle(
              color: Color(0xFF285F52),
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState(this.message);

  final String message;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(message, textAlign: TextAlign.center),
        ),
      );
}

String _dateLabel(dynamic value) {
  if (value == null) return '—';
  final parsed = DateTime.tryParse(value.toString());
  if (parsed == null) return value.toString();
  final day = parsed.day.toString().padLeft(2, '0');
  final month = parsed.month.toString().padLeft(2, '0');
  return '$day/$month/' + parsed.year.toString();
}

String _statusLabel(String? value) {
  switch (value) {
    case 'draft':
      return 'Draft';
    case 'submitted':
      return 'Terkirim';
    case 'rejected':
      return 'Perlu revisi';
    default:
      return value?.replaceAll('_', ' ') ?? '—';
  }
}
