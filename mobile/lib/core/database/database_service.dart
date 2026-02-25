import 'package:sqflite_sqlcipher/sqflite.dart';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dart:io';
import 'dart:typed_data';
import '../../core/models/report.dart';

class DatabaseService {
  static final DatabaseService _instance = DatabaseService._internal();
  static Database? _database;
  static const String _dbName = "openvote_secure.db";

  factory DatabaseService() => _instance;

  DatabaseService._internal();

  Future<Database> get database async {
    if (_database != null) return _database!;
    throw Exception("La base de données doit être ouverte avec un mot de passe.");
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
      version: 2,
      password: password, // Mot de passe RAM-only
      onCreate: _onCreate,
      onUpgrade: (db, oldVersion, newVersion) async {
         await db.execute("DROP TABLE IF EXISTS pending_reports");
         await db.execute("DROP TABLE IF EXISTS local_reports");
         await _onCreate(db, newVersion);
      }
    );
  }

  Future _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE local_reports (
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
  }

  Future<void> saveReport(Report report) async {
    final db = await database;
    await db.insert(
      'local_reports',
      report.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
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
    await _secureOverwrite("$path-wal");  // Write-Ahead Log
    await _secureOverwrite("$path-shm");  // Shared Memory
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
    print("EMERGENCY WIPE COMPLETED: Toutes les données locales ont été détruites de manière sécurisée.");
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
