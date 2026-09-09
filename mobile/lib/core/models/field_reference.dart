class FieldElection {
  final String id;
  final String name;
  final String status;
  final String date;

  FieldElection({
    required this.id,
    required this.name,
    required this.status,
    required this.date,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'status': status,
      'date': date,
    };
  }

  factory FieldElection.fromMap(Map<String, dynamic> map) {
    return FieldElection(
      id: map['id'],
      name: map['name'] ?? '',
      status: map['status'] ?? '',
      date: map['date'] ?? '',
    );
  }
}

class FieldPollingStation {
  final String id;
  final String electionId;
  final String code;
  final String name;
  final int registeredVoters;
  final String locationName;

  FieldPollingStation({
    required this.id,
    required this.electionId,
    required this.code,
    required this.name,
    required this.registeredVoters,
    required this.locationName,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'election_id': electionId,
      'code': code,
      'name': name,
      'registered_voters': registeredVoters,
      'location_name': locationName,
    };
  }

  factory FieldPollingStation.fromMap(Map<String, dynamic> map) {
    return FieldPollingStation(
      id: map['id'],
      electionId: map['election_id'],
      code: map['code'] ?? '',
      name: map['name'] ?? '',
      registeredVoters: map['registered_voters'] ?? 0,
      locationName: map['location_name'] ?? '',
    );
  }
}

class FieldCandidate {
  final String id;
  final String electionId;
  final String name;
  final String party;
  final int? ballotNumber;

  FieldCandidate({
    required this.id,
    required this.electionId,
    required this.name,
    required this.party,
    this.ballotNumber,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'election_id': electionId,
      'name': name,
      'party': party,
      'ballot_number': ballotNumber,
    };
  }

  factory FieldCandidate.fromMap(Map<String, dynamic> map) {
    return FieldCandidate(
      id: map['id'],
      electionId: map['election_id'],
      name: map['name'] ?? '',
      party: map['party'] ?? '',
      ballotNumber: map['ballot_number'],
    );
  }
}
