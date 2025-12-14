import { useState } from "react";
import { Settings, User, Bell, Shield, Globe, Moon, Sun, Monitor, Mail, Phone, Building } from "lucide-react";
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

const SettingsView = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profileData, setProfileData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    organization: user?.organization || "",
    phone: "",
  });
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    weekly: true,
    updates: true,
  });
  const [security, setSecurity] = useState({
    twoFactor: false,
    sessionTimeout: "30",
  });
  const [preferences, setPreferences] = useState({
    language: "nl",
    theme: "system",
    timezone: "Europe/Amsterdam",
  });

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

  const handleSavePreferences = () => {
    toast({
      title: "Voorkeuren bijgewerkt",
      description: "Uw voorkeuren zijn opgeslagen.",
    });
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground mb-2">Instellingen</h1>
        <p className="text-muted-foreground">Beheer uw account en voorkeuren</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">Profiel</TabsTrigger>
          <TabsTrigger value="notifications">Notificaties</TabsTrigger>
          <TabsTrigger value="security">Beveiliging</TabsTrigger>
          <TabsTrigger value="preferences">Voorkeuren</TabsTrigger>
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
                  onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-org">Organisatie</Label>
                <Input
                  id="profile-org"
                  value={profileData.organization}
                  onChange={(e) => setProfileData({ ...profileData, organization: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-phone">Telefoonnummer</Label>
                <Input
                  id="profile-phone"
                  type="tel"
                  value={profileData.phone}
                  onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                  placeholder="+31 6 12345678"
                />
              </div>
              <Button variant="hero" onClick={handleSaveProfile}>
                Opslaan
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <Bell className="w-5 h-5 text-primary" />
              <h2 className="font-display font-semibold text-foreground">Notificatie Instellingen</h2>
            </div>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email notificaties</Label>
                  <p className="text-sm text-muted-foreground">Ontvang notificaties via email</p>
                </div>
                <Switch
                  checked={notifications.email}
                  onCheckedChange={(checked) => setNotifications({ ...notifications, email: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Push notificaties</Label>
                  <p className="text-sm text-muted-foreground">Ontvang push notificaties in de browser</p>
                </div>
                <Switch
                  checked={notifications.push}
                  onCheckedChange={(checked) => setNotifications({ ...notifications, push: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Wekelijks overzicht</Label>
                  <p className="text-sm text-muted-foreground">Ontvang een wekelijks overzicht per email</p>
                </div>
                <Switch
                  checked={notifications.weekly}
                  onCheckedChange={(checked) => setNotifications({ ...notifications, weekly: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Product updates</Label>
                  <p className="text-sm text-muted-foreground">Ontvang updates over nieuwe features</p>
                </div>
                <Switch
                  checked={notifications.updates}
                  onCheckedChange={(checked) => setNotifications({ ...notifications, updates: checked })}
                />
              </div>
              <Button variant="hero" onClick={() => toast({ title: "Notificaties opgeslagen", description: "Uw notificatie-instellingen zijn bijgewerkt." })}>
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
                <Label htmlFor="language">Taal</Label>
                <Select
                  value={preferences.language}
                  onValueChange={(value) => setPreferences({ ...preferences, language: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nl">Nederlands</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="theme">Thema</Label>
                <Select
                  value={preferences.theme}
                  onValueChange={(value) => setPreferences({ ...preferences, theme: value })}
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Tijdzone</Label>
                <Select
                  value={preferences.timezone}
                  onValueChange={(value) => setPreferences({ ...preferences, timezone: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Europe/Amsterdam">Amsterdam (CET)</SelectItem>
                    <SelectItem value="Europe/London">London (GMT)</SelectItem>
                    <SelectItem value="America/New_York">New York (EST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="hero" onClick={handleSavePreferences}>
                Opslaan
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsView;

