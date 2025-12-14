import { useState, useEffect } from "react";
import { Building, Users, FileText, MoreVertical, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface Organization {
  id: string;
  name: string;
  plan: "starter" | "professional";
  usersCount: number;
  documentsCount: number;
  createdAt: string;
}

const mockOrganizations: Organization[] = [
  {
    id: "1",
    name: "TechCorp Industries",
    plan: "professional",
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
    plan: "professional",
    usersCount: 32,
    documentsCount: 89,
    createdAt: "2024-05-12",
  },
];

const planColors = {
  starter: "bg-muted text-muted-foreground",
  professional: "bg-primary/20 text-primary",
};

const OrganizationsView = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOrgDialogOpen, setAddOrgDialogOpen] = useState(false);
  const [newOrg, setNewOrg] = useState({ name: "", plan: "starter" as "starter" | "professional" });
  const { toast } = useToast();

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data) {
        // Get counts for each organization
        const orgsWithCounts = await Promise.all(
          data.map(async (org) => {
            const { count: usersCount } = await supabase
              .from("user_organizations")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", org.id);

            const { count: docsCount } = await supabase
              .from("documents")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", org.id);

            return {
              id: org.id,
              name: org.name,
              plan: org.plan as "starter" | "professional",
              usersCount: usersCount || 0,
              documentsCount: docsCount || 0,
              createdAt: format(new Date(org.created_at), "dd-MM-yyyy", { locale: nl }),
            };
          })
        );

        setOrganizations(orgsWithCounts);
      }
    } catch (error) {
      console.error("Error loading organizations:", error);
      toast({
        title: "Fout",
        description: "Kon organisaties niet laden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddOrganization = async () => {
    if (!newOrg.name) {
      toast({
        title: "Naam verplicht",
        description: "Vul een organisatienaam in.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.from("organizations").insert({
        name: newOrg.name,
        plan: newOrg.plan,
      });

      if (error) throw error;

      toast({
        title: "Organisatie toegevoegd",
        description: `${newOrg.name} is toegevoegd.`,
      });

      setAddOrgDialogOpen(false);
      setNewOrg({ name: "", plan: "starter" });
      await loadOrganizations();
    } catch (error: any) {
      console.error("Error adding organization:", error);
      toast({
        title: "Fout",
        description: error.message || "Kon organisatie niet toevoegen.",
        variant: "destructive",
      });
    }
  };

  const filteredOrganizations = organizations.filter((org) =>
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
            Beheer alle klantorganisaties ({organizations.length} totaal)
          </p>
        </div>
        <Button variant="hero" onClick={() => setAddOrgDialogOpen(true)}>
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
        {loading ? (
          <div className="col-span-full glass rounded-xl p-8 text-center">
            <p className="text-muted-foreground">Organisaties laden...</p>
          </div>
        ) : filteredOrganizations.length === 0 ? (
          <div className="col-span-full glass rounded-xl p-8 text-center">
            <Building className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Geen organisaties gevonden</p>
          </div>
        ) : (
          filteredOrganizations.map((org) => (
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
          ))
        )}
      </div>

      {/* Add Organization Dialog */}
      <Dialog open={addOrgDialogOpen} onOpenChange={setAddOrgDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Organisatie Toevoegen</DialogTitle>
            <DialogDescription>Voeg een nieuwe organisatie toe aan het systeem.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organisatienaam</Label>
              <Input
                id="org-name"
                value={newOrg.name}
                onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                placeholder="TechCorp Industries"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-plan">Abonnement</Label>
              <Select
                value={newOrg.plan}
                onValueChange={(value: "starter" | "professional") => setNewOrg({ ...newOrg, plan: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter - €99/maand</SelectItem>
                  <SelectItem value="professional">Professional - €299/maand</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOrgDialogOpen(false)}>
              Annuleren
            </Button>
            <Button variant="hero" onClick={handleAddOrganization}>
              Toevoegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrganizationsView;
