import 'package:sqflite_sqlcipher/sqflite.dart';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:io';
import '../../core/models/report.dart';

class DatabaseService {
  static final DatabaseService _instance = DatabaseService._internal();
  static Database? _database;

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
    String path = join(documentsDirectory.path, "openvote_secure.db");

    _database = await openDatabase(
      path,
      version: 2, // Incrément de version pour recréer la table si besoin (simple wipe ici)
      password: password, // Mot de passe RAM-only
      onCreate: _onCreate,
      onUpgrade: (db, oldVersion, newVersion) async {
         // Pour le dev : on drop tout si version change
         await db.execute("DROP TABLE IF EXISTS pending_reports");
         await db.execute("DROP TABLE IF EXISTS local_reports");
         await _onCreate(db, newVersion);
      }
    );
  }

  Future _onCreate(Database db, int version) async {
    // Table synchronisée avec la structure backend
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

  /// Fonction de détresse : Supprime la base de données et les préférences.
  Future<void> emergencyWipe() async {
    await closeDatabase();

    Directory documentsDirectory = await getApplicationDocumentsDirectory();
    String path = join(documentsDirectory.path, "openvote_secure.db");
    
    File dbFile = File(path);
    if (await dbFile.exists()) {
      await dbFile.delete();
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    
    print("EMERGENCY WIPE COMPLETED: Local data destroyed.");
  }

  Future<void> closeDatabase() async {
    if (_database != null) {
      await _database!.close();
      _database = null;
    }
  }
}
