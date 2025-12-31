import { useState, useEffect } from "react";
import { Settings, User, Shield, Globe, Moon, Sun, Monitor, Building, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";
import { useTheme } from "next-themes";

const SettingsView = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [profileData, setProfileData] = useState({
    name: user?.name || "",
    email: user?.email || "",
  });
  const [security, setSecurity] = useState({
    twoFactor: false,
    sessionTimeout: "30",
  });
  const [organizationSettings, setOrganizationSettings] = useState({
    techniciansCanViewDocuments: false,
  });
  const [loadingOrgSettings, setLoadingOrgSettings] = useState(true);

  const handleSaveProfile = () => {
    toast({
      title: "Profiel bijgewerkt",
      description: "Uw profielgegevens zijn succesvol opgeslagen.",
    });
  };

  const handleSaveSecurity = () => {
    toast({
      title: "Beveiligingsinstellingen bijgewerkt",
      description: "Uw beveiligingsinstellingen zijn opgeslagen.",
    });
  };

  // Handle theme change
  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    toast({
      title: "Thema bijgewerkt",
      description: "Uw thema is opgeslagen.",
    });
  };

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load organization settings
  useEffect(() => {
    if (user?.organization_id && (user.role === "manager" || user.role === "admin")) {
      loadOrganizationSettings();
    }
  }, [user?.organization_id, user?.role]);

  const loadOrganizationSettings = async () => {
    if (!user?.organization_id) return;

    try {
      setLoadingOrgSettings(true);
      const { data, error } = await supabase
        .from("organizations")
        .select("technicians_can_view_documents")
        .eq("id", user.organization_id)
        .single();

      if (error) throw error;

      if (data) {
        setOrganizationSettings({
          techniciansCanViewDocuments: data.technicians_can_view_documents || false,
        });
      }
    } catch (error: any) {
      console.error("Error loading organization settings:", error);
      toast({
        title: "Fout",
        description: "Kon organisatie-instellingen niet laden.",
        variant: "destructive",
      });
    } finally {
      setLoadingOrgSettings(false);
    }
  };


  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground mb-2">Instellingen</h1>
        <p className="text-muted-foreground">Beheer uw account en voorkeuren</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className={`grid w-full ${(user?.role === "manager" || user?.role === "admin") ? "grid-cols-4" : "grid-cols-3"}`}>
          <TabsTrigger value="profile">Profiel</TabsTrigger>
          <TabsTrigger value="security">Beveiliging</TabsTrigger>
          <TabsTrigger value="preferences">Voorkeuren</TabsTrigger>
          {(user?.role === "manager" || user?.role === "admin") && (
            <TabsTrigger value="organization">Organisatie</TabsTrigger>
          )}
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <User className="w-5 h-5 text-primary" />
              <h2 className="font-display font-semibold text-foreground">Profielgegevens</h2>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Volledige naam</Label>
                <Input
                  id="profile-name"
                  value={profileData.name}
                  onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-email">Email</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={profileData.email}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-org">Organisatie</Label>
                <Input
                  id="profile-org"
                  value={user?.organization_name || "Geen organisatie"}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <Button variant="hero" onClick={handleSaveProfile}>
                Opslaan
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="font-display font-semibold text-foreground">Beveiliging</h2>
            </div>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Twee-factor authenticatie</Label>
                  <p className="text-sm text-muted-foreground">Voeg een extra beveiligingslaag toe aan uw account</p>
                </div>
                <Switch
                  checked={security.twoFactor}
                  onCheckedChange={(checked) => setSecurity({ ...security, twoFactor: checked })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="session-timeout">Sessie timeout (minuten)</Label>
                <Select
                  value={security.sessionTimeout}
                  onValueChange={(value) => setSecurity({ ...security, sessionTimeout: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minuten</SelectItem>
                    <SelectItem value="30">30 minuten</SelectItem>
                    <SelectItem value="60">1 uur</SelectItem>
                    <SelectItem value="120">2 uur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="pt-4 border-t">
                <Button variant="outline" className="w-full">
                  Wachtwoord wijzigen
                </Button>
              </div>
              <Button variant="hero" onClick={handleSaveSecurity}>
                Opslaan
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <Globe className="w-5 h-5 text-primary" />
              <h2 className="font-display font-semibold text-foreground">Voorkeuren</h2>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="theme">Thema</Label>
                {mounted && (
                  <Select
                    value={theme || "system"}
                    onValueChange={handleThemeChange}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">
                        <div className="flex items-center gap-2">
                          <Monitor className="w-4 h-4" />
                          Systeem
                        </div>
                      </SelectItem>
                      <SelectItem value="light">
                        <div className="flex items-center gap-2">
                          <Sun className="w-4 h-4" />
                          Licht
                        </div>
                      </SelectItem>
                      <SelectItem value="dark">
                        <div className="flex items-center gap-2">
                          <Moon className="w-4 h-4" />
                          Donker
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Organization Tab - Only for managers and admins */}
        {(user?.role === "manager" || user?.role === "admin") && (
          <TabsContent value="organization" className="space-y-6">
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <Building className="w-5 h-5 text-primary" />
                <h2 className="font-display font-semibold text-foreground">Organisatie-instellingen</h2>
              </div>
              {loadingOrgSettings ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Instellingen laden...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5 flex-1">
                      <Label className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Monteurs kunnen documenten bekijken
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Sta monteurs toe om documenten te bekijken en te downloaden. Ze kunnen geen documenten uploaden of verwijderen.
                      </p>
                    </div>
                    <Switch
                      checked={organizationSettings.techniciansCanViewDocuments}
                      onCheckedChange={async (checked) => {
                        // Save immediately when toggled
                        if (!user?.organization_id) {
                          toast({
                            title: "Fout",
                            description: "Geen organisatie gevonden.",
                            variant: "destructive",
                          });
                          return;
                        }

                        // Optimistically update UI
                        const previousValue = organizationSettings.techniciansCanViewDocuments;
                        setOrganizationSettings({
                          ...organizationSettings,
                          techniciansCanViewDocuments: checked,
                        });

                        try {
                          const { error } = await supabase
                            .from("organizations")
                            .update({
                              technicians_can_view_documents: checked,
                            })
                            .eq("id", user.organization_id);

                          if (error) throw error;

                          toast({
                            title: "Instelling opgeslagen",
                            description: "De instelling is succesvol bijgewerkt.",
                          });
                        } catch (error: any) {
                          console.error("Error saving organization settings:", error);
                          // Revert on error
                          setOrganizationSettings({
                            ...organizationSettings,
                            techniciansCanViewDocuments: previousValue,
                          });
                          toast({
                            title: "Fout",
                            description: error.message || "Kon instelling niet opslaan.",
                            variant: "destructive",
                          });
                        }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default SettingsView;









