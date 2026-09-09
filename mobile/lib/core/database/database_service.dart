import 'package:sqflite_sqlcipher/sqflite.dart';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dart:io';
import 'dart:typed_data';
import '../../core/models/report.dart';
import '../../core/models/field_reference.dart';
import '../../core/models/pv_submission.dart';

class DatabaseService {
  static final DatabaseService _instance = DatabaseService._internal();
  static Database? _database;
  static const String _dbName = "openvote_secure.db";

  factory DatabaseService() => _instance;

  DatabaseService._internal();

  Future<Database> get database async {
    if (_database != null) return _database!;
    throw Exception(
      "La base de données doit être ouverte avec un mot de passe.",
    );
  }

  // Alias pour respecter la convention de nommage demandée
  Future<void> initDatabase(String password) async {
    return openEncryptedDatabase(password);
  }

  /// Ouvre la base de données uniquement si le mot de passe est fourni.
  /// L'utilisation de sqflite_sqlcipher garantit le chiffrement au repos.
  Future<void> openEncryptedDatabase(String password) async {
    if (_database != null) return;

    Directory documentsDirectory = await getApplicationDocumentsDirectory();
    String path = join(documentsDirectory.path, _dbName);

    _database = await openDatabase(
      path,
      version: 7,
      password: password, // Mot de passe RAM-only
      onCreate: _onCreate,
      onUpgrade: (db, oldVersion, newVersion) async {
        await _onCreate(db, newVersion);
        if (oldVersion < 5) {
          await _addColumnIfMissing(
            db,
            'local_pv_submissions',
            'server_id',
            'TEXT',
          );
          await _addColumnIfMissing(
            db,
            'local_pv_submissions',
            'status_message',
            'TEXT',
          );
          await _addColumnIfMissing(
            db,
            'local_pv_submissions',
            'status_updated_at',
            'TEXT',
          );
        }
        if (oldVersion < 6) {
          await _addColumnIfMissing(
            db,
            'local_pv_submissions',
            'proof_manifest_version',
            'INTEGER DEFAULT 1',
          );
          await _addColumnIfMissing(
            db,
            'local_pv_submissions',
            'signature',
            'TEXT',
          );
          await _addColumnIfMissing(
            db,
            'local_pv_submissions',
            'client_recorded_at',
            'TEXT',
          );
          await _addColumnIfMissing(
            db,
            'local_pv_submissions',
            'device_latitude',
            'REAL DEFAULT 0',
          );
          await _addColumnIfMissing(
            db,
            'local_pv_submissions',
            'device_longitude',
            'REAL DEFAULT 0',
          );
          await _addColumnIfMissing(
            db,
            'local_pv_submissions',
            'device_id',
            'TEXT',
          );
          await _addColumnIfMissing(
            db,
            'local_pv_submissions',
            'server_payload_hash',
            'TEXT',
          );
          await _addColumnIfMissing(
            db,
            'local_pv_submissions',
            'integrity_status',
            'TEXT',
          );
          await _addColumnIfMissing(
            db,
            'local_pv_submissions',
            'integrity_errors_json',
            'TEXT',
          );
        }
        if (oldVersion < 7) {
          await _addColumnIfMissing(
            db,
            'local_pv_submissions',
            'pv_photo_path',
            'TEXT',
          );
          await _addColumnIfMissing(
            db,
            'local_pv_submissions',
            'pv_photo_url',
            'TEXT',
          );
        }
      },
    );
  }

  Future _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS local_reports (
        id TEXT PRIMARY KEY,
        observer_id TEXT,
        incident_type TEXT,
        description TEXT,
        latitude REAL,
        longitude REAL,
        h3_index TEXT,
        status TEXT,
        proof_url TEXT,
        created_at TEXT,
        synced_at TEXT
      )
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS local_pv_submissions (
        id TEXT PRIMARY KEY,
        election_id TEXT,
        polling_station_id TEXT,
        polling_station_code TEXT,
        observer_id TEXT,
        registered_voters INTEGER,
        voters_count INTEGER,
        null_votes INTEGER,
        blank_votes INTEGER,
        disputed_votes INTEGER,
        pv_photo_path TEXT,
        pv_photo_url TEXT,
        pv_hash TEXT,
        signed_payload_hash TEXT,
        signature TEXT,
        proof_manifest_version INTEGER DEFAULT 1,
        client_recorded_at TEXT,
        device_latitude REAL DEFAULT 0,
        device_longitude REAL DEFAULT 0,
        device_id TEXT,
        server_payload_hash TEXT,
        integrity_status TEXT,
        integrity_errors_json TEXT,
        notes TEXT,
        status TEXT,
        server_id TEXT,
        status_message TEXT,
        results_json TEXT,
        created_at TEXT,
        synced_at TEXT,
        status_updated_at TEXT
      )
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS cached_elections (
        id TEXT PRIMARY KEY,
        name TEXT,
        status TEXT,
        date TEXT
      )
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS cached_polling_stations (
        id TEXT PRIMARY KEY,
        election_id TEXT,
        code TEXT,
        name TEXT,
        registered_voters INTEGER,
        location_name TEXT
      )
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS cached_candidates (
        id TEXT PRIMARY KEY,
        election_id TEXT,
        name TEXT,
        party TEXT,
        ballot_number INTEGER
      )
    ''');
  }

  Future<void> _addColumnIfMissing(
    Database db,
    String table,
    String column,
    String type,
  ) async {
    try {
      await db.execute('ALTER TABLE $table ADD COLUMN $column $type');
    } catch (_) {
      // La colonne existe déjà sur les bases créées directement à jour.
    }
  }

  Future<void> saveReport(Report report) async {
    final db = await database;
    await db.insert(
      'local_reports',
      report.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> savePvSubmission(PvSubmission pv) async {
    final db = await database;
    await db.insert(
      'local_pv_submissions',
      pv.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<PvSubmission>> getPendingPvSubmissions() async {
    final db = await database;
    final rows = await db.query(
      'local_pv_submissions',
      where: 'synced_at IS NULL',
      orderBy: 'created_at DESC',
    );
    return rows.map((row) => PvSubmission.fromMap(row)).toList();
  }

  Future<List<PvSubmission>> getPvSubmissions() async {
    final db = await database;
    final rows = await db.query(
      'local_pv_submissions',
      orderBy: 'created_at DESC',
    );
    return rows.map((row) => PvSubmission.fromMap(row)).toList();
  }

  Future<void> updatePvSubmissionStatus({
    required String id,
    required String status,
    String? serverId,
    String? statusMessage,
    String? serverPayloadHash,
    String? integrityStatus,
    String? integrityErrorsJson,
    DateTime? syncedAt,
    DateTime? statusUpdatedAt,
  }) async {
    final db = await database;
    final values = <String, Object?>{
      'status': status,
      'status_updated_at':
          (statusUpdatedAt ?? DateTime.now()).toIso8601String(),
    };
    if (serverId != null) values['server_id'] = serverId;
    if (statusMessage != null) values['status_message'] = statusMessage;
    if (serverPayloadHash != null) {
      values['server_payload_hash'] = serverPayloadHash;
    }
    if (integrityStatus != null) values['integrity_status'] = integrityStatus;
    if (integrityErrorsJson != null) {
      values['integrity_errors_json'] = integrityErrorsJson;
    }
    if (syncedAt != null) values['synced_at'] = syncedAt.toIso8601String();

    await db.update(
      'local_pv_submissions',
      values,
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> replaceElections(List<FieldElection> elections) async {
    final db = await database;
    final batch = db.batch();
    batch.delete('cached_elections');
    for (final election in elections) {
      batch.insert(
        'cached_elections',
        election.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await batch.commit(noResult: true);
  }

  Future<List<FieldElection>> getCachedElections() async {
    final db = await database;
    final rows = await db.query('cached_elections', orderBy: 'date DESC');
    return rows.map((row) => FieldElection.fromMap(row)).toList();
  }

  Future<void> replacePollingStations(
    String electionId,
    List<FieldPollingStation> stations,
  ) async {
    final db = await database;
    final batch = db.batch();
    batch.delete(
      'cached_polling_stations',
      where: 'election_id = ?',
      whereArgs: [electionId],
    );
    for (final station in stations) {
      batch.insert(
        'cached_polling_stations',
        station.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await batch.commit(noResult: true);
  }

  Future<List<FieldPollingStation>> getCachedPollingStations(
    String electionId,
  ) async {
    final db = await database;
    final rows = await db.query(
      'cached_polling_stations',
      where: 'election_id = ?',
      whereArgs: [electionId],
      orderBy: 'code ASC',
    );
    return rows.map((row) => FieldPollingStation.fromMap(row)).toList();
  }

  Future<void> replaceCandidates(
    String electionId,
    List<FieldCandidate> candidates,
  ) async {
    final db = await database;
    final batch = db.batch();
    batch.delete(
      'cached_candidates',
      where: 'election_id = ?',
      whereArgs: [electionId],
    );
    for (final candidate in candidates) {
      batch.insert(
        'cached_candidates',
        candidate.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await batch.commit(noResult: true);
  }

  Future<List<FieldCandidate>> getCachedCandidates(String electionId) async {
    final db = await database;
    final rows = await db.query(
      'cached_candidates',
      where: 'election_id = ?',
      whereArgs: [electionId],
      orderBy: 'ballot_number ASC, name ASC',
    );
    return rows.map((row) => FieldCandidate.fromMap(row)).toList();
  }

  /// Code de détresse (Panic Button) configurable
  /// Retourne le PIN de détresse depuis le stockage sécurisé, ou '0000' par défaut
  static Future<String> getDuressPin() async {
    const storage = FlutterSecureStorage();
    return await storage.read(key: 'duress_pin') ?? '0000';
  }

  /// Définit un nouveau PIN de détresse
  static Future<void> setDuressPin(String pin) async {
    const storage = FlutterSecureStorage();
    await storage.write(key: 'duress_pin', value: pin);
  }

  /// Vérifie si le PIN entré est le code de détresse
  static Future<bool> isDuressPin(String pin) async {
    final duressPin = await getDuressPin();
    return pin == duressPin;
  }

  /// FONCTION DE DÉTRESSE SÉCURISÉE (Emergency Wipe)
  /// Conformément aux specs de sécurité :
  /// 1. Ferme la base de données
  /// 2. ÉCRASE le fichier avec des zéros (empêche la récupération forensique)
  /// 3. Supprime le fichier écrasé + fichiers journaux WAL/SHM
  /// 4. Efface les SharedPreferences et le SecureStorage
  Future<void> emergencyWipe() async {
    // 1. Fermer la DB proprement
    await closeDatabase();

    Directory documentsDirectory = await getApplicationDocumentsDirectory();
    String path = join(documentsDirectory.path, _dbName);

    // 2. Écraser avec des zéros (Secure Overwrite)
    await _secureOverwrite(path);
    await _secureOverwrite("$path-wal"); // Write-Ahead Log
    await _secureOverwrite("$path-shm"); // Shared Memory
    await _secureOverwrite("$path-journal"); // Journal de rollback

    // 3. Supprimer les fichiers écrasés
    await _secureDelete(path);
    await _secureDelete("$path-wal");
    await _secureDelete("$path-shm");
    await _secureDelete("$path-journal");

    // 4. Purger toutes les préférences et le stockage sécurisé
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();

    const secureStorage = FlutterSecureStorage();
    await secureStorage.deleteAll();

    // Note : Ne pas logger de données sensibles (respecte règle du prompt)
    print(
      "EMERGENCY WIPE COMPLETED: Toutes les données locales ont été détruites de manière sécurisée.",
    );
  }

  /// Écrase un fichier avec des zéros avant suppression
  /// Empêche la récupération des données par analyse forensique du stockage
  Future<void> _secureOverwrite(String filePath) async {
    try {
      File file = File(filePath);
      if (await file.exists()) {
        final length = await file.length();
        // Écriture de blocs de zéros
        final zeroBlock = Uint8List(4096); // 4KB de zéros
        final raf = await file.open(mode: FileMode.write);

        int written = 0;
        while (written < length) {
          final toWrite = (length - written) > 4096 ? 4096 : (length - written);
          await raf.writeFrom(zeroBlock, 0, toWrite);
          written += toWrite;
        }

        await raf.flush();
        await raf.close();
      }
    } catch (e) {
      // Silencieux : en cas d'erreur, on continue la procédure de nettoyage
    }
  }

  /// Supprime un fichier de manière sûre
  Future<void> _secureDelete(String filePath) async {
    try {
      File file = File(filePath);
      if (await file.exists()) {
        await file.delete();
      }
    } catch (e) {
      // Silencieux
    }
  }

  Future<void> closeDatabase() async {
    if (_database != null) {
      await _database!.close();
      _database = null;
    }
  }
}
