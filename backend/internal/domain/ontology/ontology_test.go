package ontology

import (
	"os"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

type ontologyDocument struct {
	Ontology struct {
		ID      string `yaml:"id"`
		Version int    `yaml:"version"`
		Status  string `yaml:"status"`
	} `yaml:"ontology"`
	Domains      map[string]interface{}    `yaml:"domains"`
	Entities     map[string]ontologyEntity `yaml:"entities"`
	Vocabularies map[string]struct {
		Values []string `yaml:"values"`
	} `yaml:"vocabularies"`
	Relations  []ontologyRelation `yaml:"relations"`
	Invariants []struct {
		ID     string `yaml:"id"`
		Entity string `yaml:"entity"`
		Rule   string `yaml:"rule"`
	} `yaml:"invariants"`
}

type ontologyEntity struct {
	Domain         string                    `yaml:"domain"`
	Sensitivity    string                    `yaml:"sensitivity"`
	PublicExposure string                    `yaml:"public_exposure"`
	Fields         map[string]map[string]any `yaml:"fields"`
}

type ontologyRelation struct {
	Subject   string `yaml:"subject"`
	Predicate string `yaml:"predicate"`
	Object    string `yaml:"object"`
}

func TestOpenvoteOntologyV1Contract(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "docs", "ontology", "openvote-ontology.v1.yaml"))
	if err != nil {
		t.Fatalf("lecture ontologie: %v", err)
	}

	var doc ontologyDocument
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("YAML ontologie invalide: %v", err)
	}

	if doc.Ontology.ID != "openvote-ontology" {
		t.Fatalf("ontology.id inattendu: %q", doc.Ontology.ID)
	}
	if doc.Ontology.Version != 1 {
		t.Fatalf("ontology.version inattendue: %d", doc.Ontology.Version)
	}
	if doc.Ontology.Status == "" {
		t.Fatalf("ontology.status requis")
	}

	for _, domain := range []string{"election", "territory", "field_ops", "pv", "proof", "audit"} {
		if _, ok := doc.Domains[domain]; !ok {
			t.Fatalf("domaine obligatoire absent: %s", domain)
		}
	}

	requiredEntities := []string{
		"Election",
		"Candidate",
		"HistoricalElectionResult",
		"Region",
		"Department",
		"Arrondissement",
		"PollingStation",
		"Observer",
		"PollingStationAssignment",
		"PVSubmission",
		"PVResult",
		"PVPhotoProof",
		"CanonicalManifest",
		"ObserverDeviceKey",
		"PVAnomaly",
		"PVAuditEvent",
		"RegionalRiskSnapshot",
		"PublicPVProof",
		"PublicRegionalRiskProof",
		"PublicPVProofExport",
		"PublicPVExportProof",
	}
	for _, entity := range requiredEntities {
		entry, ok := doc.Entities[entity]
		if !ok {
			t.Fatalf("entité obligatoire absente: %s", entity)
		}
		if entry.Domain == "" {
			t.Fatalf("entité sans domaine: %s", entity)
		}
	}

	for _, vocabulary := range []string{
		"pv_status",
		"integrity_status",
		"integrity_error_code",
		"risk_status",
		"risk_rule_code",
		"pv_anomaly_code",
		"anomaly_severity",
		"sensitivity_level",
		"public_exposure",
	} {
		entry, ok := doc.Vocabularies[vocabulary]
		if !ok {
			t.Fatalf("vocabulaire obligatoire absent: %s", vocabulary)
		}
		if len(entry.Values) == 0 {
			t.Fatalf("vocabulaire vide: %s", vocabulary)
		}
	}

	requiredRelations := []ontologyRelation{
		{Subject: "PollingStation", Predicate: "belongs_to", Object: "Region"},
		{Subject: "PollingStationAssignment", Predicate: "assigned_to", Object: "Observer"},
		{Subject: "PVSubmission", Predicate: "concerns", Object: "PollingStation"},
		{Subject: "PVSubmission", Predicate: "has_result", Object: "PVResult"},
		{Subject: "PVSubmission", Predicate: "has_anomaly", Object: "PVAnomaly"},
		{Subject: "PVAuditEvent", Predicate: "audits", Object: "PVSubmission"},
		{Subject: "RegionalRiskSnapshot", Predicate: "derived_from", Object: "PVSubmission"},
		{Subject: "PublicPVProofExport", Predicate: "includes", Object: "PublicRegionalRiskProof"},
		{Subject: "PublicPVExportProof", Predicate: "signs", Object: "PublicPVProofExport"},
	}
	for _, relation := range requiredRelations {
		if !hasRelation(doc.Relations, relation) {
			t.Fatalf("relation obligatoire absente: %s %s %s", relation.Subject, relation.Predicate, relation.Object)
		}
	}

	pvSubmission := doc.Entities["PVSubmission"]
	for _, field := range []string{"pv_hash", "signed_payload_hash", "server_payload_hash", "integrity_status"} {
		if _, ok := pvSubmission.Fields[field]; !ok {
			t.Fatalf("PVSubmission.%s absent de l'ontologie", field)
		}
	}
	publicProof := doc.Entities["PublicPVProof"]
	if publicProof.PublicExposure != "public" {
		t.Fatalf("PublicPVProof doit être public, obtenu: %q", publicProof.PublicExposure)
	}
	if _, ok := publicProof.Fields["polling_station_region"]; !ok {
		t.Fatalf("PublicPVProof.polling_station_region doit documenter le champ legacy")
	}
	if len(doc.Invariants) == 0 {
		t.Fatalf("invariants obligatoires absents")
	}
}

func hasRelation(relations []ontologyRelation, expected ontologyRelation) bool {
	for _, relation := range relations {
		if relation == expected {
			return true
		}
	}
	return false
}
