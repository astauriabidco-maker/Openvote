import 'dart:io';

import 'package:flutter/material.dart';
import 'package:crypto/crypto.dart';
import 'package:image_picker/image_picker.dart';
import 'package:uuid/uuid.dart';

import '../../../core/auth/offline_session_service.dart';
import '../../../core/crypto/device_signature_service.dart';
import '../../../core/database/database_service.dart';
import '../../../core/models/field_reference.dart';
import '../../../core/models/pv_submission.dart';
import '../../../core/sync/reference_sync_service.dart';
import '../../../core/sync/sync_service.dart';
import '../../../core/utils/pv_proof.dart';

class PvFormScreen extends StatefulWidget {
  const PvFormScreen({super.key});

  @override
  State<PvFormScreen> createState() => _PvFormScreenState();
}

class _PvFormScreenState extends State<PvFormScreen> {
  final _registeredController = TextEditingController(text: '0');
  final _votersController = TextEditingController(text: '0');
  final _nullController = TextEditingController(text: '0');
  final _blankController = TextEditingController(text: '0');
  final _disputedController = TextEditingController(text: '0');
  final _notesController = TextEditingController();
  final Map<String, TextEditingController> _voteControllers = {};

  List<FieldElection> _elections = [];
  List<FieldPollingStation> _stations = [];
  List<FieldCandidate> _candidates = [];
  List<PvSubmission> _localPvs = [];
  String? _electionId;
  String? _stationId;
  String? _observerId;
  bool _saving = false;
  bool _loadingRefs = true;
  bool _syncingRefs = false;
  bool _syncingPvStatuses = false;
  String? _referenceError;
  File? _pvPhoto;
  String _pvPhotoHash = '';

  @override
  void initState() {
    super.initState();
    _loadCachedReferences();
  }

  Future<void> _loadCachedReferences() async {
    final observerId = await const OfflineSessionService().readObserverId();
    final elections = await DatabaseService().getCachedElections();
    if (!mounted) return;
    setState(() {
      _observerId = observerId;
      _elections = elections;
      _electionId = elections.isNotEmpty ? elections.first.id : null;
      _loadingRefs = false;
    });
    await _loadElectionChildren();
    await _loadLocalPvs();
  }

  Future<void> _loadLocalPvs() async {
    final pvs = await DatabaseService().getPvSubmissions();
    if (!mounted) return;
    setState(() => _localPvs = pvs);
  }

  Future<void> _loadElectionChildren() async {
    if (_electionId == null) {
      setState(() {
        _stations = [];
        _candidates = [];
        _stationId = null;
      });
      return;
    }
    final stations =
        await DatabaseService().getCachedPollingStations(_electionId!);
    final candidates =
        await DatabaseService().getCachedCandidates(_electionId!);
    for (final controller in _voteControllers.values) {
      controller.dispose();
    }
    _voteControllers.clear();
    for (final candidate in candidates) {
      _voteControllers[candidate.id] = TextEditingController(text: '0');
    }
    final firstStation = stations.isNotEmpty ? stations.first : null;
    if (!mounted) return;
    setState(() {
      _stations = stations;
      _candidates = candidates;
      _stationId = firstStation?.id;
      if (firstStation != null) {
        _registeredController.text = firstStation.registeredVoters.toString();
      }
    });
  }

  Future<void> _syncReferences() async {
    setState(() {
      _syncingRefs = true;
      _referenceError = null;
    });
    try {
      final result = await ReferenceSyncService().syncFieldReferences();
      await _loadCachedReferences();
      await _syncPvStatuses(showMessage: false);
      if (!mounted) return;
      setState(() => _syncingRefs = false);
      _showMessage(result.message);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _syncingRefs = false;
        _referenceError = 'Synchronisation impossible: $e';
      });
      _showMessage('Synchronisation impossible.');
    }
  }

  Future<void> _syncPvStatuses({bool showMessage = true}) async {
    setState(() => _syncingPvStatuses = true);
    try {
      await SyncService().syncPendingPvSubmissions();
      final updated = await SyncService().refreshPvStatuses();
      await _loadLocalPvs();
      if (!mounted) return;
      setState(() => _syncingPvStatuses = false);
      if (showMessage) {
        _showMessage(
          updated == 0
              ? 'Statuts PV à jour avec les données disponibles.'
              : '$updated statut(s) PV mis à jour.',
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _syncingPvStatuses = false);
      if (showMessage) _showMessage('Statuts PV indisponibles hors ligne.');
    }
  }

  int _toInt(TextEditingController controller) {
    return int.tryParse(controller.text.trim()) ?? 0;
  }

  T? _firstWhereOrNull<T>(Iterable<T> items, bool Function(T item) test) {
    for (final item in items) {
      if (test(item)) return item;
    }
    return null;
  }

  Future<void> _capturePvPhoto() async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.camera,
      imageQuality: 92,
    );
    if (picked == null) return;
    final file = File(picked.path);
    final bytes = await file.readAsBytes();
    if (!mounted) return;
    setState(() {
      _pvPhoto = file;
      _pvPhotoHash = sha256.convert(bytes).toString();
    });
  }

  Future<void> _savePv() async {
    final election = _firstWhereOrNull(_elections, (e) => e.id == _electionId);
    final station = _firstWhereOrNull(_stations, (s) => s.id == _stationId);
    if (election == null) {
      _showMessage('Aucun scrutin disponible. Synchronisez les références.');
      return;
    }
    if (station == null) {
      _showMessage('Aucun bureau assigné pour ce scrutin.');
      return;
    }
    if (_candidates.isEmpty) {
      _showMessage('Aucun candidat chargé pour ce scrutin.');
      return;
    }

    final results = _candidates.map((candidate) {
      return PvResult(
        candidateId: candidate.id,
        candidateName: candidate.name,
        votes: _toInt(_voteControllers[candidate.id]!),
      );
    }).toList();
    final totalVotes = results.fold<int>(0, (sum, item) => sum + item.votes);
    final ballotTotal = totalVotes +
        _toInt(_nullController) +
        _toInt(_blankController) +
        _toInt(_disputedController);
    final votersCount = _toInt(_votersController);

    if (ballotTotal > votersCount) {
      _showMessage('La somme des bulletins dépasse le nombre de votants.');
      return;
    }

    setState(() => _saving = true);
    final clientRecordedAt = DateTime.now().toUtc().toIso8601String();
    final deviceId = await const OfflineSessionService().getOrCreateDeviceId();
    final proofManifest = buildPvProofManifest(
      electionId: election.id,
      pollingStationId: station.id,
      registeredVoters: _toInt(_registeredController),
      votersCount: votersCount,
      nullVotes: _toInt(_nullController),
      blankVotes: _toInt(_blankController),
      disputedVotes: _toInt(_disputedController),
      pvHash: _pvPhotoHash,
      clientRecordedAt: clientRecordedAt,
      deviceLatitude: 0,
      deviceLongitude: 0,
      deviceId: deviceId,
      results: results,
    );
    final canonicalPayload = encodePvProofManifest(proofManifest);
    final signatureService = const DeviceSignatureService();
    final signature = await signatureService.signCanonicalPayload(
      canonicalPayload,
    );
    await signatureService.registerPublicKeyIfPossible();

    final pv = PvSubmission(
      id: const Uuid().v4(),
      electionId: election.id,
      pollingStationId: station.id,
      pollingStationCode: station.code,
      observerId: _observerId ?? '',
      registeredVoters: _toInt(_registeredController),
      votersCount: votersCount,
      nullVotes: _toInt(_nullController),
      blankVotes: _toInt(_blankController),
      disputedVotes: _toInt(_disputedController),
      pvPhotoPath: _pvPhoto?.path ?? '',
      pvHash: _pvPhotoHash,
      signedPayloadHash: sha256Hex(canonicalPayload),
      signature: signature,
      proofManifestVersion: 1,
      clientRecordedAt: clientRecordedAt,
      deviceLatitude: 0,
      deviceLongitude: 0,
      deviceId: deviceId,
      notes: _notesController.text,
      status: 'pending',
      results: results,
      createdAt: DateTime.now(),
    );

    await DatabaseService().savePvSubmission(pv);
    await SyncService().syncPendingPvSubmissions();
    await _loadLocalPvs();
    setState(() {
      _saving = false;
      _pvPhoto = null;
      _pvPhotoHash = '';
    });
    _showMessage('PV sauvegardé localement.');
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Widget _numberField(TextEditingController controller, String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        keyboardType: TextInputType.number,
        decoration: InputDecoration(
            labelText: label, border: const OutlineInputBorder()),
      ),
    );
  }

  @override
  void dispose() {
    _registeredController.dispose();
    _votersController.dispose();
    _nullController.dispose();
    _blankController.dispose();
    _disputedController.dispose();
    _notesController.dispose();
    for (final controller in _voteControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final station = _firstWhereOrNull(_stations, (s) => s.id == _stationId);
    final canSave = !_saving &&
        !_loadingRefs &&
        _elections.isNotEmpty &&
        _stations.isNotEmpty &&
        _candidates.isNotEmpty;
    return Scaffold(
      appBar: AppBar(
        title: const Text('PV terrain offline'),
        actions: [
          IconButton(
            onPressed: _syncingPvStatuses ? null : () => _syncPvStatuses(),
            tooltip: 'Rafraîchir les statuts PV',
            icon: _syncingPvStatuses
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.fact_check),
          ),
          IconButton(
            onPressed: _syncingRefs ? null : _syncReferences,
            tooltip: 'Rafraîchir les références terrain',
            icon: _syncingRefs
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.sync),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_loadingRefs)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: LinearProgressIndicator(),
            ),
          if (_syncingRefs)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child:
                  Text('Synchronisation des scrutins, bureaux et candidats...'),
            ),
          if (_referenceError != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                _referenceError!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          if (_observerId == null)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Text(
                "Identité observateur locale absente. Le PV sera signé par le token au moment de l'envoi.",
              ),
            ),
          DropdownButtonFormField<String>(
            initialValue: _electionId,
            decoration: const InputDecoration(
                labelText: 'Scrutin', border: OutlineInputBorder()),
            items: _elections.map((election) {
              return DropdownMenuItem(
                  value: election.id, child: Text(election.name));
            }).toList(),
            onChanged: (value) async {
              setState(() => _electionId = value);
              await _loadElectionChildren();
            },
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _stationId,
            decoration: const InputDecoration(
                labelText: 'Bureau assigné', border: OutlineInputBorder()),
            items: _stations.map((station) {
              return DropdownMenuItem(
                  value: station.id,
                  child: Text('${station.code} · ${station.name}'));
            }).toList(),
            onChanged: (value) {
              final selected =
                  _firstWhereOrNull(_stations, (s) => s.id == value);
              setState(() {
                _stationId = value;
                if (selected != null) {
                  _registeredController.text =
                      selected.registeredVoters.toString();
                }
              });
            },
          ),
          if (station != null && station.locationName.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 12),
              child: Text(station.locationName,
                  style: Theme.of(context).textTheme.bodySmall),
            ),
          ..._emptyReferenceMessages(),
          const SizedBox(height: 12),
          _numberField(_registeredController, 'Inscrits'),
          _numberField(_votersController, 'Votants'),
          _numberField(_nullController, 'Bulletins nuls'),
          _numberField(_blankController, 'Bulletins blancs'),
          _numberField(_disputedController, 'Bulletins contestés'),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _saving ? null : _capturePvPhoto,
            icon: const Icon(Icons.photo_camera),
            label: Text(
              _pvPhoto == null ? 'Photographier le PV' : 'Reprendre la photo',
            ),
          ),
          if (_pvPhotoHash.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('Hash photo: ${_pvPhotoHash.substring(0, 18)}...'),
            ),
          const Divider(height: 28),
          ..._candidates.map((candidate) {
            return _numberField(
              _voteControllers[candidate.id]!,
              '${candidate.name}${candidate.party.isNotEmpty ? ' · ${candidate.party}' : ''}',
            );
          }),
          TextField(
            controller: _notesController,
            maxLines: 3,
            decoration: const InputDecoration(
                labelText: 'Notes', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: canSave ? _savePv : null,
            icon: const Icon(Icons.how_to_vote),
            label: Text(_saving ? 'Sauvegarde...' : 'Sauvegarder le PV'),
          ),
          const SizedBox(height: 24),
          _buildLocalPvSection(),
        ],
      ),
    );
  }

  Widget _buildLocalPvSection() {
    if (_localPvs.isEmpty) {
      return const Text('Aucun PV sauvegardé sur cet appareil.');
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'PV sauvegardés',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        ..._localPvs.map(_buildPvStatusCard),
      ],
    );
  }

  Widget _buildPvStatusCard(PvSubmission pv) {
    final statusColor = _statusColor(pv.status);
    final requiresAction = pv.needsFieldAction;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    pv.pollingStationCode.isEmpty
                        ? pv.pollingStationId
                        : pv.pollingStationCode,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                Chip(
                  label: Text(_statusLabel(pv.status)),
                  backgroundColor: statusColor.withAlpha(36),
                  labelStyle: TextStyle(color: statusColor),
                  side: BorderSide(color: statusColor.withAlpha(102)),
                ),
              ],
            ),
            Text(
              'Votants: ${pv.votersCount} · Créé: ${_shortDate(pv.createdAt)}',
            ),
            if (pv.syncedAt != null)
              Text('Envoyé: ${_shortDate(pv.syncedAt!)}'),
            if (pv.statusUpdatedAt != null)
              Text('Statut actualisé: ${_shortDate(pv.statusUpdatedAt!)}'),
            if (pv.pvHash.isNotEmpty)
              Text('Hash photo: ${pv.pvHash.substring(0, 12)}...'),
            if (pv.statusMessage.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(pv.statusMessage),
              ),
            if (requiresAction)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  pv.status == 'rejected'
                      ? 'PV rejeté: vérifiez les chiffres et les preuves avant nouvelle consigne.'
                      : 'Correction demandée: relisez le PV papier et les notes de vérification.',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'verified':
        return Colors.green.shade700;
      case 'rejected':
        return Colors.red.shade700;
      case 'needs_clarification':
        return Colors.orange.shade800;
      case 'submitted':
      case 'pending':
        return Colors.blue.shade700;
      case 'failed':
        return Colors.deepOrange.shade700;
      default:
        return Colors.grey.shade700;
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'pending':
        return 'En attente';
      case 'submitted':
        return 'Envoyé';
      case 'verified':
        return 'Validé';
      case 'rejected':
        return 'Rejeté';
      case 'needs_clarification':
        return 'Correction';
      case 'failed':
        return 'À renvoyer';
      default:
        return status;
    }
  }

  String _shortDate(DateTime value) {
    final day = value.day.toString().padLeft(2, '0');
    final month = value.month.toString().padLeft(2, '0');
    final hour = value.hour.toString().padLeft(2, '0');
    final minute = value.minute.toString().padLeft(2, '0');
    return '$day/$month $hour:$minute';
  }

  List<Widget> _emptyReferenceMessages() {
    final messages = <String>[];
    if (!_loadingRefs && _elections.isEmpty) {
      messages.add('Aucun scrutin en cache. Rafraîchissez les références.');
    } else {
      if (!_loadingRefs && _stations.isEmpty) {
        messages.add('Aucun bureau assigné pour ce scrutin.');
      }
      if (!_loadingRefs && _candidates.isEmpty) {
        messages.add('Aucun candidat chargé pour ce scrutin.');
      }
    }

    return messages
        .map(
          (message) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Text(message),
          ),
        )
        .toList();
  }
}
