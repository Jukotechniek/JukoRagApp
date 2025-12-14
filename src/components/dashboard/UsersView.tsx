import { useState } from "react";
import { Users, MoreVertical, Plus, Search, Mail, Shield, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface User {
  id: string;
  name: string;
  email: string;
  role: "manager" | "technician";
  status: "active" | "inactive";
  lastActive: string;
}

interface UsersViewProps {
  currentRole: "admin" | "manager" | "technician";
}

// Mock data for manager view (their own technicians)
const mockManagerUsers: User[] = [
  {
    id: "1",
    name: "Jan de Vries",
    email: "jan@techcorp.nl",
    role: "manager",
    status: "active",
    lastActive: "Nu online",
  },
  {
    id: "2",
    name: "Pieter Jansen",
    email: "pieter@techcorp.nl",
    role: "technician",
    status: "active",
    lastActive: "2 uur geleden",
  },
  {
    id: "3",
    name: "Klaas Bakker",
    email: "klaas@techcorp.nl",
    role: "technician",
    status: "active",
    lastActive: "1 dag geleden",
  },
  {
    id: "4",
    name: "Willem Smit",
    email: "willem@techcorp.nl",
    role: "technician",
    status: "inactive",
    lastActive: "1 week geleden",
  },
];

// Mock data for admin view (all users across organizations)
const mockAdminUsers: User[] = [
  ...mockManagerUsers,
  {
    id: "5",
    name: "Anna van Dijk",
    email: "anna@buildright.nl",
    role: "manager",
    status: "active",
    lastActive: "3 uur geleden",
  },
  {
    id: "6",
    name: "Erik Visser",
    email: "erik@buildright.nl",
    role: "technician",
    status: "active",
    lastActive: "30 min geleden",
  },
];

const UsersView = ({ currentRole }: UsersViewProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const users = currentRole === "admin" ? mockAdminUsers : mockManagerUsers;
  const currentUser = mockManagerUsers[0]; // First user is the manager themselves

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const technicians = filteredUsers.filter((u) => u.role === "technician");

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
        <Button variant="hero">
          <Plus className="w-4 h-4 mr-2" />
          {currentRole === "manager" ? "Monteur Toevoegen" : "Gebruiker Toevoegen"}
        </Button>
      </div>

      {/* Manager's own account card */}
      {currentRole === "manager" && (
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
            <Button variant="outline" size="sm">
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
        {(currentRole === "manager" ? technicians : filteredUsers).map((user) => (
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

            <button className="p-2 hover:bg-secondary rounded-lg transition-colors">
              <MoreVertical className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UsersView;
