import { useState } from "react";
import { Building, Users, FileText, MoreVertical, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Organization {
  id: string;
  name: string;
  plan: "starter" | "professional" | "enterprise";
  usersCount: number;
  documentsCount: number;
  createdAt: string;
}

const mockOrganizations: Organization[] = [
  {
    id: "1",
    name: "TechCorp Industries",
    plan: "enterprise",
    usersCount: 45,
    documentsCount: 128,
    createdAt: "2024-01-15",
  },
  {
    id: "2",
    name: "BuildRight BV",
    plan: "professional",
    usersCount: 12,
    documentsCount: 34,
    createdAt: "2024-02-20",
  },
  {
    id: "3",
    name: "Innovate Solutions",
    plan: "starter",
    usersCount: 5,
    documentsCount: 8,
    createdAt: "2024-03-10",
  },
  {
    id: "4",
    name: "MechaPro Engineering",
    plan: "professional",
    usersCount: 18,
    documentsCount: 67,
    createdAt: "2024-04-05",
  },
  {
    id: "5",
    name: "ElectraFix Nederland",
    plan: "enterprise",
    usersCount: 32,
    documentsCount: 89,
    createdAt: "2024-05-12",
  },
];

const planColors = {
  starter: "bg-muted text-muted-foreground",
  professional: "bg-primary/20 text-primary",
  enterprise: "bg-accent/20 text-accent",
};

const OrganizationsView = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredOrganizations = mockOrganizations.filter((org) =>
    org.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Organisaties
          </h1>
          <p className="text-muted-foreground">
            Beheer alle klantorganisaties ({mockOrganizations.length} totaal)
          </p>
        </div>
        <Button variant="hero">
          <Plus className="w-4 h-4 mr-2" />
          Organisatie Toevoegen
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Zoek organisaties..."
          className="pl-10"
        />
      </div>

      {/* Organizations Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredOrganizations.map((org) => (
          <div
            key={org.id}
            className="glass rounded-2xl p-5 hover:border-primary/30 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building className="w-6 h-6 text-primary" />
              </div>
              <button className="p-2 hover:bg-secondary rounded-lg transition-colors">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <h3 className="font-display font-semibold text-foreground mb-1">
              {org.name}
            </h3>

            <span
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize mb-4 ${
                planColors[org.plan]
              }`}
            >
              {org.plan}
            </span>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border/30">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {org.usersCount} gebruikers
                </span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {org.documentsCount} docs
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrganizationsView;
