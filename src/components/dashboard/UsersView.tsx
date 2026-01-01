import { useState, useEffect } from "react";
import { Users, MoreVertical, Plus, Search, Mail, Shield, Wrench, Trash2, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "technician";
  status: "active" | "inactive";
  lastActive: string;
}

interface UsersViewProps {
  currentRole: "admin" | "manager" | "technician";
  selectedOrganizationId?: string | null;
}

const UsersView = ({ currentRole, selectedOrganizationId }: UsersViewProps) => {
  const { user: currentAuthUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [editProfileDialogOpen, setEditProfileDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "technician" as "manager" | "technician" });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Use selected organization ID or fall back to user's organization
  const effectiveOrgId = selectedOrganizationId || currentAuthUser?.organization_id || null;

  // Load users
  useEffect(() => {
    loadUsers();
  }, [currentRole, currentAuthUser, effectiveOrgId]);

  const loadUsers = async () => {
    if (!currentAuthUser) return;

    try {
      setLoading(true);
      let query = supabase.from("users").select("*");

      if (currentRole === "admin" && effectiveOrgId) {
        // Admin sees users in selected organization
        const { data: orgUsers } = await supabase
          .from("user_organizations")
          .select("user_id")
          .eq("organization_id", effectiveOrgId);

        if (orgUsers) {
          const userIds = orgUsers.map((uo) => uo.user_id);
          const { data, error } = await query.in("id", userIds).order("created_at", { ascending: false });
          if (error) throw error;
          if (data) {
            setUsers(
              data.map((u) => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role as "admin" | "manager" | "technician",
                status: "active" as const,
                lastActive: formatDistanceToNow(new Date(u.updated_at), { addSuffix: true, locale: nl }),
              }))
            );
          }
        } else {
          setUsers([]);
        }
      } else if (effectiveOrgId) {
        // Manager/Technician sees users in their organization
        const { data: orgUsers } = await supabase
          .from("user_organizations")
          .select("user_id")
          .eq("organization_id", effectiveOrgId);

        if (orgUsers) {
          const userIds = orgUsers.map((uo) => uo.user_id);
          const { data, error } = await query.in("id", userIds).order("created_at", { ascending: false });
          if (error) throw error;
          if (data) {
            setUsers(
              data.map((u) => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role as "admin" | "manager" | "technician",
                status: "active" as const,
                lastActive: formatDistanceToNow(new Date(u.updated_at), { addSuffix: true, locale: nl }),
              }))
            );
          }
        } else {
          setUsers([]);
        }
      } else {
        setUsers([]);
      }
    } catch (error) {
      console.error("Error loading users:", error);
      toast({
        title: "Fout",
        description: "Kon gebruikers niet laden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const currentUser = currentAuthUser
    ? {
        id: currentAuthUser.id,
        name: currentAuthUser.name,
        email: currentAuthUser.email,
        role: currentAuthUser.role,
        status: "active" as const,
        lastActive: "Nu online",
      }
    : null;

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const technicians = filteredUsers.filter((u) => u.role === "technician");

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.email || !effectiveOrgId || !currentAuthUser) {
      toast({
        title: "Velden verplicht",
        description: "Vul alle verplichte velden in.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Get Supabase session for authorization
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        toast({
          title: "Fout",
          description: "Je bent niet ingelogd. Log opnieuw in.",
          variant: "destructive",
        });
        return;
      }

      // Use API route to create user with Admin API
      const response = await fetch('/api/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          organizationId: effectiveOrgId,
          currentUserId: currentAuthUser.id,
          currentUserRole: currentRole,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create user');
      }

      // Show different message based on whether invite was sent
      if (data.inviteSent) {
        toast({
          title: "Gebruiker toegevoegd",
          description: `${newUser.name} is toegevoegd aan het team. Een invite email is verzonden naar ${newUser.email}.`,
        });
      } else {
        toast({
          title: "Gebruiker toegevoegd",
          description: `${newUser.name} is toegevoegd aan het team. Deze gebruiker bestaat al in het systeem.`,
        });
      }

      setAddUserDialogOpen(false);
      setNewUser({ name: "", email: "", role: "technician" });
      await loadUsers();
    } catch (error: any) {
      console.error("Error adding user:", error);
      toast({
        title: "Fout",
        description: error.message || "Kon gebruiker niet toevoegen. Mogelijk bestaat de gebruiker al.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete || !effectiveOrgId || !currentAuthUser) return;

    try {
      // Get Supabase session for authorization
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        toast({
          title: "Fout",
          description: "Je bent niet ingelogd. Log opnieuw in.",
          variant: "destructive",
        });
        return;
      }

      // Use API route to delete user
      // The API will automatically delete completely if user is only in this organization
      const response = await fetch('/api/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: userToDelete.id,
          organizationId: effectiveOrgId,
          currentUserId: currentAuthUser.id,
          currentUserRole: currentRole,
          deleteFromAuth: true, // Always try to delete completely if user is only in this org
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete user');
      }

      toast({
        title: "Gebruiker verwijderd",
        description: `${userToDelete.name} is verwijderd uit het team.`,
      });

      setDeleteDialogOpen(false);
      setUserToDelete(null);
      await loadUsers();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast({
        title: "Verwijderen mislukt",
        description: error.message || "Er is een fout opgetreden.",
        variant: "destructive",
      });
    }
  };

  const handleEditProfile = async () => {
    if (!currentAuthUser) return;

    try {
      const { error } = await supabase
        .from("users")
        .update({
          name: currentAuthUser.name, // In production, get from form
          email: currentAuthUser.email,
        })
        .eq("id", currentAuthUser.id);

      if (error) throw error;

      toast({
        title: "Profiel bijgewerkt",
        description: "Uw profiel is succesvol bijgewerkt.",
      });
      setEditProfileDialogOpen(false);
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast({
        title: "Bijwerken mislukt",
        description: error.message || "Er is een fout opgetreden.",
        variant: "destructive",
      });
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {currentRole === "manager" ? "Mijn Team" : "Alle Gebruikers"}
          </h1>
          <p className="text-muted-foreground">
            {currentRole === "manager"
              ? `${technicians.length} monteurs in jouw team`
              : `${users.length} gebruikers totaal`}
          </p>
        </div>
        <Button 
          variant="hero" 
          onClick={() => {
            // Reset form and set default role
            setNewUser({ 
              name: "", 
              email: "", 
              role: "technician" 
            });
            setAddUserDialogOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          {currentRole === "manager" ? "Gebruiker Toevoegen" : "Gebruiker Toevoegen"}
        </Button>
      </div>

      {/* Manager's own account card */}
      {currentRole === "manager" && currentUser && (
        <div className="glass rounded-2xl p-5 mb-6 border-primary/30">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center">
              <Shield className="w-7 h-7 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-display font-semibold text-foreground">
                  {currentUser.name}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary capitalize">
                  {currentUser.role}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{currentUser.email}</p>
              <p className="text-xs text-primary mt-1">{currentUser.lastActive}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditProfileDialogOpen(true)}>
              <Edit className="w-4 h-4 mr-2" />
              Profiel Bewerken
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Zoek gebruikers..."
          className="pl-10"
        />
      </div>

      {/* Section Title for Manager */}
      {currentRole === "manager" && (
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-primary" />
          Mijn Monteurs
        </h2>
      )}

      {/* Users List */}
      <div className="space-y-3">
        {loading ? (
          <div className="glass rounded-xl p-8 text-center">
            <p className="text-muted-foreground">Gebruikers laden...</p>
          </div>
        ) : (currentRole === "manager" ? technicians : filteredUsers).length === 0 ? (
          <div className="glass rounded-xl p-8 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Geen gebruikers gevonden</p>
          </div>
        ) : (
          (currentRole === "manager" ? technicians : filteredUsers).map((user) => (
          <div
            key={user.id}
            className="glass rounded-xl p-4 flex items-center gap-4 hover:border-primary/30 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
              {user.role === "manager" ? (
                <Shield className="w-5 h-5 text-primary" />
              ) : (
                <Wrench className="w-5 h-5 text-muted-foreground" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-foreground truncate">{user.name}</h4>
                {currentRole === "admin" && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      user.role === "manager"
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {user.role}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="w-3 h-3" />
                <span className="truncate">{user.email}</span>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-3">
              <div
                className={`w-2 h-2 rounded-full ${
                  user.status === "active" ? "bg-green-500" : "bg-muted-foreground"
                }`}
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {user.lastActive}
              </span>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-2 hover:bg-secondary rounded-lg transition-colors">
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => handleDeleteUser(user)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Verwijderen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          ))
        )}
      </div>

      {/* Add User Dialog */}
      <Dialog open={addUserDialogOpen} onOpenChange={setAddUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gebruiker Toevoegen</DialogTitle>
            <DialogDescription>
              Voeg een nieuwe gebruiker toe aan het team. Ze ontvangen een email om hun wachtwoord in te stellen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Volledige naam</Label>
              <Input
                id="name"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="Jan de Vries"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="jan@voorbeeld.nl"
              />
            </div>
            {(currentRole === "admin" || currentRole === "manager") && (
              <div className="space-y-2">
                <Label htmlFor="role">Rol</Label>
                <Select value={newUser.role} onValueChange={(value: "manager" | "technician") => setNewUser({ ...newUser, role: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="technician">Monteur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserDialogOpen(false)}>
              Annuleren
            </Button>
            <Button variant="hero" onClick={handleAddUser}>
              Toevoegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={editProfileDialogOpen} onOpenChange={setEditProfileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Profiel Bewerken</DialogTitle>
            <DialogDescription>Wijzig uw profielgegevens.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Volledige naam</Label>
              <Input id="edit-name" defaultValue={currentUser.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" defaultValue={currentUser.email} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-org">Organisatie</Label>
              <Input id="edit-org" defaultValue={currentAuthUser?.organization_id || "VDL Technics"} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProfileDialogOpen(false)}>
              Annuleren
            </Button>
            <Button variant="hero" onClick={handleEditProfile}>
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gebruiker verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je "{userToDelete?.name}" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UsersView;
