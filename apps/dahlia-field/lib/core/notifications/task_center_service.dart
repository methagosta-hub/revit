import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../../data/dahlia_access.dart';
import '../../data/task_center_repository.dart';

class TaskCenterService extends ChangeNotifier {
  TaskCenterService({required TaskCenterRepository repository})
      : _repository = repository;

  final TaskCenterRepository _repository;
  Timer? _timer;
  DahliaAccess? _access;
  List<DahliaTask> _tasks = const [];
  List<String> _warnings = const [];
  bool _isLoading = false;
  bool _hasInitialSnapshot = false;
  DateTime? _lastUpdated;
  String? _lastError;

  List<DahliaTask> get tasks => _tasks;
  List<String> get warnings => _warnings;
  bool get isLoading => _isLoading;
  DateTime? get lastUpdated => _lastUpdated;
  String? get lastError => _lastError;
  int get pendingCount => _tasks.length;

  void start(DahliaAccess access) {
    _access = access;
    _timer?.cancel();
    unawaited(refresh(playAlert: false));
    _timer = Timer.periodic(
      const Duration(seconds: 45),
      (_) => unawaited(refresh()),
    );
  }

  void pause() {
    _timer?.cancel();
    _timer = null;
  }

  void resume() {
    final access = _access;
    if (access == null || _timer != null) return;
    unawaited(refresh());
    _timer = Timer.periodic(
      const Duration(seconds: 45),
      (_) => unawaited(refresh()),
    );
  }

  Future<void> refresh({bool playAlert = true}) async {
    final access = _access;
    if (access == null || _isLoading) return;
    _isLoading = true;
    notifyListeners();
    try {
      final snapshot = await _repository.load(access);
      final oldIds = _tasks.map((task) => task.id).toSet();
      final newTasks = snapshot.tasks;
      final hasNewTask = _hasInitialSnapshot &&
          newTasks.any((task) => !oldIds.contains(task.id));

      _tasks = newTasks;
      _warnings = snapshot.warnings;
      _lastError = null;
      _lastUpdated = DateTime.now();
      _hasInitialSnapshot = true;

      if (playAlert && hasNewTask) {
        unawaited(SystemSound.play(SystemSoundType.alert));
        unawaited(HapticFeedback.mediumImpact());
      }
    } catch (error) {
      _lastError = error.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    pause();
    super.dispose();
  }
}
