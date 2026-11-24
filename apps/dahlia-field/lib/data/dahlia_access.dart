class DahliaAccess {
  const DahliaAccess({
    required this.profile,
    required this.roles,
    required this.permissions,
  });

  final Map<String, dynamic>? profile;
  final List<Map<String, dynamic>> roles;
  final List<Map<String, dynamic>> permissions;

  factory DahliaAccess.fromRpc(dynamic value) {
    if (value is! Map) {
      throw const FormatException('Respons hak akses Dahlia tidak valid.');
    }
    final payload = Map<String, dynamic>.from(value);
    final rawProfile = payload['profile'];
    return DahliaAccess(
      profile: rawProfile is Map
          ? Map<String, dynamic>.from(rawProfile)
          : null,
      roles: _maps(payload['roles']),
      permissions: _maps(payload['permissions']),
    );
  }

  bool get isActive => profile?['is_active'] == true;

  String get fullName =>
      (profile?['full_name'] as String?)?.trim().isNotEmpty == true
          ? (profile!['full_name'] as String).trim()
          : 'Pengguna';

  List<String> get roleCodes => roles
      .map((role) => role['code']?.toString() ?? '')
      .where((code) => code.isNotEmpty)
      .toSet()
      .toList(growable: false);

  bool hasRole(String code) => roles.any((role) => role['code'] == code);

  bool hasPermission(String code, {String? projectId}) {
    if (!isActive) return false;
    return permissions.any((permission) {
      if (permission['code'] != code) return false;
      final scopeProjectId = permission['project_id']?.toString();
      return scopeProjectId == null ||
          (projectId != null && scopeProjectId == projectId);
    });
  }

  bool hasAnyPermission(Iterable<String> codes) =>
      codes.any((code) => hasPermission(code));

  bool hasAnyProjectPermission(Iterable<String> codes) {
    if (!isActive) return false;
    return permissions.any((permission) =>
        codes.contains(permission['code']) &&
        permission['project_id'] != null);
  }

  bool get canCreatePurchaseOrder =>
      hasPermission('procurement.purchase.create');

  bool get canApprovePurchaseOrder =>
      hasPermission('procurement.purchase.approve');

  bool get canReviewMaterialRequest =>
      hasPermission('procurement.request.review');

  bool get canReceiveMaterial => hasPermission('warehouse.receive');

  bool get canIssueMaterial => hasPermission('warehouse.issue');

  bool get canManageWarehouse => hasPermission('warehouse.manage');

  bool get canReadFinance => hasPermission('finance.read');

  bool get canManagePayments => hasPermission('finance.payment.manage');

  bool get canReadPersonnel => hasPermission('personnel.read');

  bool get canManageAttendance => hasPermission('attendance.manage');

  bool get canReadPayroll => hasPermission('payroll.read');

  bool get canManageUsers => hasPermission('user.manage');

  static List<Map<String, dynamic>> _maps(dynamic value) {
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList(growable: false);
  }
}

String dahliaRoleLabel(String code) {
  const labels = <String, String>{
    'director': 'Direktur',
    'project_manager': 'Project Manager',
    'estimator': 'Estimator',
    'site_supervisor': 'Pengawas',
    'foreman': 'Mandor',
    'purchasing': 'Purchasing',
    'warehouse': 'Gudang',
    'finance': 'Keuangan',
    'hr': 'Personalia',
    'admin': 'Administrator',
    'external_report_writer': 'Pelapor Eksternal',
    'subcontractor': 'Subkontraktor',
  };
  return labels[code] ?? code.replaceAll('_', ' ');
}
