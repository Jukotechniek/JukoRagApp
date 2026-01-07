import { useState, useEffect } from "react";
import { User, Shield, Globe, Moon, Sun, Monitor, Building, FileText } from "lucide-react";
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
  const [loadingPreferences, setLoadingPreferences] = useState(true);

  // Load user preferences
  useEffect(() => {
    if (user?.id) {
      loadUserPreferences();
    }
  }, [user?.id]);

  const loadUserPreferences = async () => {
    if (!user?.id) return;

    try {
      setLoadingPreferences(true);
      const { data, error } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      if (data) {
        setSecurity({
          twoFactor: data.two_factor_enabled || false,
          sessionTimeout: String(data.session_timeout_minutes || 30),
        });
        if (data.theme) {
          setTheme(data.theme);
        }
      }
    } catch (error: any) {
      console.error("Error loading user preferences:", error);
    } finally {
      setLoadingPreferences(false);
    }
  };

  const saveUserPreferences = async (updates: {
    theme?: string;
    two_factor_enabled?: boolean;
    session_timeout_minutes?: number;
  }) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from("user_preferences")
        .upsert({
          user_id: user.id,
          ...updates,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;
    } catch (error: any) {
      console.error("Error saving user preferences:", error);
      throw error;
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) {
      toast({
        title: "Fout",
        description: "Geen gebruiker gevonden.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("users")
        .update({ name: profileData.name })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Profiel bijgewerkt",
        description: "Uw profielgegevens zijn succesvol opgeslagen.",
      });
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message || "Kon profiel niet opslaan.",
        variant: "destructive",
      });
    }
  };

  const handleSaveSecurity = async () => {
    try {
      await saveUserPreferences({
        two_factor_enabled: security.twoFactor,
        session_timeout_minutes: parseInt(security.sessionTimeout),
      });

      toast({
        title: "Beveiligingsinstellingen bijgewerkt",
        description: "Uw beveiligingsinstellingen zijn opgeslagen.",
      });
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message || "Kon beveiligingsinstellingen niet opslaan.",
        variant: "destructive",
      });
    }
  };

  // Handle theme change
  const handleThemeChange = async (newTheme: string) => {
    try {
      setTheme(newTheme);
      await saveUserPreferences({ theme: newTheme });
      toast({
        title: "Thema bijgewerkt",
        description: "Uw thema is opgeslagen.",
      });
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message || "Kon thema niet opslaan.",
        variant: "destructive",
      });
    }
  };

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

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
        // Handle null/undefined values - default to false
        const canView = data.technicians_can_view_documents === true;
        console.log("Loaded organization settings:", data.technicians_can_view_documents, "->", canView);
        setOrganizationSettings({
          techniciansCanViewDocuments: canView,
        });
      } else {
        console.log("No data returned from loadOrganizationSettings");
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

  // Load organization settings
  useEffect(() => {
    if (user?.organization_id && (user.role === "manager" || user.role === "admin")) {
      loadOrganizationSettings();

      // Subscribe to real-time updates (only for external changes, not our own)
      const channel = supabase
        .channel(`organization-settings-${user.organization_id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "organizations",
            filter: `id=eq.${user.organization_id}`,
          },
          (payload) => {
            // Only update if the value is different from current state
            // This prevents overwriting our optimistic updates
            const newValue = payload.new.technicians_can_view_documents === true;
            setOrganizationSettings((prev) => {
              // Only update if value actually changed
              if (prev.techniciansCanViewDocuments !== newValue) {
                return {
                  techniciansCanViewDocuments: newValue,
                };
              }
              return prev;
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.organization_id, user?.role]);


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
            {loadingPreferences ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Beveiligingsinstellingen laden...</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Twee-factor authenticatie</Label>
                    <p className="text-sm text-muted-foreground">Voeg een extra beveiligingslaag toe aan uw account</p>
                  </div>
                  <Switch
                    checked={security.twoFactor}
                    onCheckedChange={async (checked) => {
                      const previousValue = security.twoFactor;
                      setSecurity({ ...security, twoFactor: checked });
                      try {
                        await saveUserPreferences({ two_factor_enabled: checked });
                        toast({
                          title: "Instelling opgeslagen",
                          description: "Twee-factor authenticatie is bijgewerkt.",
                        });
                      } catch (error: any) {
                        setSecurity({ ...security, twoFactor: previousValue });
                        toast({
                          title: "Fout",
                          description: error.message || "Kon instelling niet opslaan.",
                          variant: "destructive",
                        });
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="session-timeout">Sessie timeout (minuten)</Label>
                  <Select
                    value={security.sessionTimeout}
                    onValueChange={async (value) => {
                      const previousValue = security.sessionTimeout;
                      setSecurity({ ...security, sessionTimeout: value });
                      try {
                        await saveUserPreferences({ session_timeout_minutes: parseInt(value) });
                        toast({
                          title: "Instelling opgeslagen",
                          description: "Sessie timeout is bijgewerkt.",
                        });
                      } catch (error: any) {
                        setSecurity({ ...security, sessionTimeout: previousValue });
                        toast({
                          title: "Fout",
                          description: error.message || "Kon instelling niet opslaan.",
                          variant: "destructive",
                        });
                      }
                    }}
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
            )}
          </div>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <Globe className="w-5 h-5 text-primary" />
              <h2 className="font-display font-semibold text-foreground">Voorkeuren</h2>
            </div>
            {loadingPreferences ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Voorkeuren laden...</p>
              </div>
            ) : (
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
            )}
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
                          // First, try to update without .single() to avoid PGRST116 error
                          const { data: updateData, error } = await supabase
                            .from("organizations")
                            .update({
                              technicians_can_view_documents: checked,
                              updated_at: new Date().toISOString(),
                            })
                            .eq("id", user.organization_id)
                            .select("technicians_can_view_documents");

                          if (error) throw error;

                          // Check if update actually affected any rows
                          if (!updateData || updateData.length === 0) {
                            // Update didn't affect any rows - likely RLS policy issue
                            console.error("Update failed: No rows affected. Check RLS policies.");
                            throw new Error("Update niet toegestaan. Controleer uw rechten.");
                          }

                          // Verify the update was successful
                          const actualValue = updateData[0].technicians_can_view_documents === true;
                          console.log("Update successful, new value:", actualValue);
                          
                          // Ensure state matches what was actually saved
                          setOrganizationSettings({
                            techniciansCanViewDocuments: actualValue,
                          });

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









