import { useState, useMemo, useEffect } from "react";
import { CreditCard, Check, Download, Calendar, Sparkles, Building } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface Invoice {
  id: string;
  date: string;
  amount: string;
  status: "paid" | "pending" | "overdue";
  plan: string;
  organizationId: string;
}

interface Organization {
  id: string;
  name: string;
  plan: "starter" | "professional" | "enterprise";
}

interface BillingViewProps {
  selectedOrganizationId?: string | null;
}

const BillingView = ({ selectedOrganizationId: propSelectedOrgId }: BillingViewProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCVC, setCardCVC] = useState("");
  const [cardName, setCardName] = useState("");
  const [changePlanDialogOpen, setChangePlanDialogOpen] = useState(false);
  const [newPlan, setNewPlan] = useState<"starter" | "professional" | "enterprise">("professional");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalSelectedOrganizationId, setInternalSelectedOrganizationId] = useState<string>("");

  // Use prop if provided (from admin selector), otherwise use internal state
  const selectedOrganizationId = propSelectedOrgId || internalSelectedOrganizationId;

  // Load organizations
  useEffect(() => {
    loadOrganizations();
  }, [user]);

  // Load invoices when organization changes
  useEffect(() => {
    if (selectedOrganizationId) {
      loadInvoices();
    }
  }, [selectedOrganizationId, propSelectedOrgId]);

  const loadOrganizations = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      let query = supabase.from("organizations").select("*");

      if (user.role === "admin") {
        // Admin sees all organizations
        const { data, error } = await query.order("created_at", { ascending: false });
        if (error) {
          console.error("Error loading organizations (admin):", error);
          throw error;
        }
        if (data && data.length > 0) {
          setOrganizations(data);
          if (!propSelectedOrgId && !internalSelectedOrganizationId) {
            setInternalSelectedOrganizationId(data[0].id);
          }
        } else {
          console.warn("No organizations found for admin");
          setOrganizations([]);
        }
      } else if (user.organization_id) {
        // Manager/Technician sees their organization
        const { data, error } = await query.eq("id", user.organization_id).maybeSingle();
        if (error) {
          console.error("Error loading organization:", error);
          throw error;
        }
        if (data) {
          setOrganizations([data]);
          if (!propSelectedOrgId) {
            setInternalSelectedOrganizationId(data.id);
          }
        } else {
          console.warn("Organization not found:", user.organization_id);
          setOrganizations([]);
        }
      } else {
        console.warn("User has no organization_id");
        setOrganizations([]);
      }
    } catch (error: any) {
      console.error("Error loading organizations:", error);
      toast({
        title: "Fout",
        description: error.message || "Kon organisaties niet laden. Check de browser console voor details.",
        variant: "destructive",
      });
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  };

  // Bepaal beschikbare organisaties op basis van rol
  const availableOrganizations = useMemo(() => {
    return organizations;
  }, [organizations]);

  // Initialiseer geselecteerde organisatie wanneer beschikbaar
  useEffect(() => {
    if (availableOrganizations.length > 0 && !selectedOrganizationId) {
      setInternalSelectedOrganizationId(availableOrganizations[0].id);
    }
  }, [availableOrganizations, selectedOrganizationId]);

  const loadInvoices = async () => {
    if (!selectedOrganizationId) {
      console.log("No selectedOrganizationId, skipping invoice load");
      return;
    }

    try {
      console.log("Loading invoices for organization:", selectedOrganizationId);
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("organization_id", selectedOrganizationId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Invoice query error:", error);
        throw error;
      }
      
      console.log("Invoices loaded:", data);

      if (data) {
        setInvoices(
          data.map((inv) => ({
            id: inv.invoice_number || inv.id, // Use invoice_number if available, fallback to id
            date: format(new Date(inv.created_at), "dd-MM-yyyy", { locale: nl }),
            amount: `€${Number(inv.amount).toFixed(2).replace(".", ",")}`,
            status: inv.status as "paid" | "pending" | "overdue",
            plan: inv.plan,
            organizationId: inv.organization_id,
          }))
        );
      } else {
        setInvoices([]);
      }
    } catch (error: any) {
      console.error("Error loading invoices:", error);
      toast({
        title: "Fout",
        description: error.message || "Kon facturen niet laden.",
        variant: "destructive",
      });
      setInvoices([]);
    }
  };

  const selectedOrganization = useMemo(
    () => {
      const org = organizations.find((org) => org.id === selectedOrganizationId);
      console.log("Selected organization:", org, "Organizations:", organizations, "Selected ID:", selectedOrganizationId);
      return org;
    },
    [selectedOrganizationId, organizations]
  );

  const currentInvoices = invoices;

  // Bepaal huidig plan op basis van geselecteerde organisatie
  const currentPlan = useMemo(() => {
    const plan = selectedOrganization?.plan || "professional";
    const planData = {
      starter: {
        name: "Starter",
        price: "--",
        period: "per maand",
        features: ["Tot 100 documenten", "Tot 5 gebruikers", "Basis support", "Basis analytics"],
      },
      professional: {
        name: "Professional",
        price: "--",
        period: "per maand",
        features: [
          "Onbeperkte documenten",
          "Onbeperkte gebruikers",
          "Prioriteit support",
          "Geavanceerde analytics",
        ],
      },
      enterprise: {
        name: "Enterprise",
        price: "--",
        period: "",
        features: [
          "Onbeperkte documenten en gebruikers",
          "Lokaal draaiend AI-model (on-premise of private cloud)",
          "Volledig maatwerk ingericht op uw processen",
          "Dedicated support & SLA",
        ],
      },
    };
    return planData[plan as keyof typeof planData];
  }, [selectedOrganization]);

  const plans = [
    {
      id: "starter",
      name: "Starter",
      price: "--",
      period: "per maand",
      features: ["Tot 100 documenten", "Tot 5 gebruikers", "Basis support", "Basis analytics"],
    },
    {
      id: "professional",
      name: "Professional",
      price: "--",
      period: "per maand",
      features: [
        "Onbeperkte documenten",
        "Onbeperkte gebruikers",
        "Prioriteit support",
        "Geavanceerde analytics",
      ],
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: "--",
      period: "",
      features: [
        "Onbeperkte documenten en gebruikers",
        "Lokaal draaiend AI-model (on-premise of private cloud)",
        "Volledig maatwerk ingericht op uw processen",
        "Dedicated support & SLA",
      ],
    },
  ];

  const handlePayment = () => {
    if (!cardNumber || !cardExpiry || !cardCVC || !cardName) {
      toast({
        title: "Velden verplicht",
        description: "Vul alle betalingsgegevens in.",
        variant: "destructive",
      });
      return;
    }

    // Simuleer Stripe betaling
    toast({
      title: "Betalingsmethode bijgewerkt",
      description: "Uw betalingsgegevens zijn succesvol opgeslagen.",
    });
    setPaymentDialogOpen(false);
    setCardNumber("");
    setCardExpiry("");
    setCardCVC("");
    setCardName("");
  };

  const handlePlanChange = (planId: "starter" | "professional" | "enterprise") => {
    if (user?.role === "admin" && selectedOrganization) {
      // Admin kan abonnement wijzigen voor organisatie
      setNewPlan(planId);
      setChangePlanDialogOpen(true);
    } else {
      // Voor niet-admin gebruikers
      toast({
        title: "Abonnement gewijzigd",
        description: `Uw abonnement is gewijzigd naar ${plans.find((p) => p.id === planId)?.name}.`,
      });
    }
  };

  const confirmPlanChange = async () => {
    if (!selectedOrganization || user?.role !== "admin") return;

    try {
      const { error } = await supabase
        .from("organizations")
        .update({ plan: newPlan })
        .eq("id", selectedOrganization.id);

      if (error) throw error;

      // Update local state
      setOrganizations((prev) =>
        prev.map((org) =>
          org.id === selectedOrganization.id ? { ...org, plan: newPlan } : org
        )
      );

      toast({
        title: "Abonnement gewijzigd",
        description: `Abonnement voor ${selectedOrganization.name} is gewijzigd naar ${plans.find((p) => p.id === newPlan)?.name}.`,
      });
      setChangePlanDialogOpen(false);
    } catch (error: any) {
      console.error("Error changing plan:", error);
      toast({
        title: "Fout",
        description: error.message || "Kon abonnement niet wijzigen.",
        variant: "destructive",
      });
    }
  };

  // Show loading state
  if (loading) {
    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground mb-2">Facturatie</h1>
            <p className="text-muted-foreground">Beheer uw abonnement en facturen</p>
          </div>
        </div>
        <div className="glass rounded-xl p-8 text-center">
          <p className="text-muted-foreground">Laden...</p>
        </div>
      </div>
    );
  }

  // Show error state if no organization
  if (!selectedOrganization && organizations.length === 0) {
    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground mb-2">Facturatie</h1>
            <p className="text-muted-foreground">Beheer uw abonnement en facturen</p>
          </div>
        </div>
        <div className="glass rounded-xl p-8 text-center">
          <Building className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-2">Geen organisatie gevonden</p>
          <p className="text-sm text-muted-foreground">
            {user?.organization_id 
              ? "Uw organisatie kon niet worden geladen. Neem contact op met support."
              : "U bent nog niet gekoppeld aan een organisatie."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground mb-1 sm:mb-2">Facturatie</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Beheer uw abonnement en facturen</p>
        </div>
        {user?.role === "admin" && availableOrganizations.length > 1 && !propSelectedOrgId && (
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-muted-foreground" />
            <Select value={selectedOrganizationId} onValueChange={setInternalSelectedOrganizationId}>
              <SelectTrigger className="w-full sm:w-[250px]">
                <SelectValue placeholder="Selecteer organisatie" />
              </SelectTrigger>
              <SelectContent>
                {availableOrganizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {user?.role !== "admin" && selectedOrganization && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building className="w-4 h-4" />
            <span className="truncate">{selectedOrganization.name}</span>
          </div>
        )}
      </div>

      {/* Current Plan */}
      {(selectedOrganization || selectedOrganizationId) ? (
        <>
          <div className="glass rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border-primary/30">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
              <div className="flex-1">
                {user?.role === "admin" && selectedOrganization && (
                  <div className="flex items-center gap-2 mb-2 text-xs sm:text-sm text-muted-foreground">
                    <Building className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="truncate">{selectedOrganization.name}</span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  <h2 className="font-display text-lg sm:text-xl font-semibold text-foreground">{currentPlan.name}</h2>
                  <span className="px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium bg-primary/20 text-primary">Actief</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-foreground mb-1">
                  {currentPlan.price} <span className="text-sm sm:text-base text-muted-foreground">{currentPlan.period}</span>
                </p>
              </div>
              <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setPaymentDialogOpen(true)}>
                <CreditCard className="w-4 h-4 mr-2" />
                Betalingsmethode
              </Button>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {currentPlan.features.map((feature, index) => (
                <div key={index} className="flex items-start gap-2 text-xs sm:text-sm">
                  <Check className="w-3 h-3 sm:w-4 sm:h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Available Plans */}
          <div className="mb-4 sm:mb-6">
            <h2 className="font-display text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">
              {user?.role === "admin" ? "Abonnement Wijzigen" : "Beschikbare Abonnementen"}
            </h2>
            <div className="grid md:grid-cols-2 gap-3 sm:gap-4">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`glass rounded-lg sm:rounded-xl p-4 sm:p-6 ${
                    selectedOrganization?.plan === plan.id ? "border-2 border-primary" : "border border-border/30"
                  }`}
                >
                  <div className="mb-3 sm:mb-4">
                    <h3 className="font-display text-base sm:text-lg font-semibold text-foreground mb-1">{plan.name}</h3>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">
                      {plan.price} {plan.period && <span className="text-xs sm:text-sm text-muted-foreground">{plan.period}</span>}
                    </p>
                  </div>
                  <ul className="space-y-1.5 sm:space-y-2 mb-3 sm:mb-4">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground">
                        <Check className="w-3 h-3 sm:w-4 sm:h-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={selectedOrganization?.plan === plan.id ? "outline" : "hero"}
                    size="sm"
                    className="w-full text-xs sm:text-sm"
                    disabled={selectedOrganization?.plan === plan.id}
                    onClick={() => handlePlanChange(plan.id as "starter" | "professional" | "enterprise")}
                  >
                    {selectedOrganization?.plan === plan.id
                      ? "Huidig Plan"
                      : plan.id === "enterprise"
                        ? "Prijs op aanvraag"
                        : user?.role === "admin"
                          ? "Wijzigen"
                          : "Upgraden"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="glass rounded-xl p-6 sm:p-8 text-center">
          <Building className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
          <p className="text-sm sm:text-base text-muted-foreground">Selecteer een organisatie om facturatie te bekijken</p>
        </div>
      )}

      {/* Invoices - Always show if we have an organization */}
      {(selectedOrganization || selectedOrganizationId) && (
        <div>
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="font-display text-base sm:text-lg font-semibold text-foreground">Facturen</h2>
            <span className="text-xs sm:text-sm text-muted-foreground">
              {currentInvoices.length} factuur{currentInvoices.length !== 1 ? "en" : ""}
            </span>
          </div>
          <div className="space-y-2 sm:space-y-3">
            {loading && currentInvoices.length === 0 ? (
              <div className="glass rounded-xl p-6 sm:p-8 text-center">
                <p className="text-sm sm:text-base text-muted-foreground">Facturen laden...</p>
              </div>
            ) : currentInvoices.length === 0 ? (
              <div className="glass rounded-xl p-6 sm:p-8 text-center">
                <Calendar className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
                <p className="text-sm sm:text-base text-muted-foreground mb-2">Geen facturen gevonden voor deze organisatie</p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Facturen worden automatisch aangemaakt wanneer een abonnement wordt geactiveerd.
                </p>
              </div>
            ) : (
              currentInvoices.map((invoice) => (
                <div key={invoice.id} className="glass rounded-lg sm:rounded-xl p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-3 sm:gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm sm:text-base text-foreground truncate">{invoice.id}</p>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{invoice.date}</p>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1 sm:hidden">{invoice.plan}</p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:gap-4 flex-shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="font-semibold text-foreground">{invoice.amount}</p>
                        <p className="text-sm text-muted-foreground">{invoice.plan}</p>
                      </div>
                      <div className="text-right sm:text-left sm:hidden">
                        <p className="font-semibold text-sm text-foreground">{invoice.amount}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-1 rounded-full text-[10px] sm:text-xs font-medium whitespace-nowrap ${
                            invoice.status === "paid"
                              ? "bg-green-500/20 text-green-500"
                              : invoice.status === "pending"
                                ? "bg-yellow-500/20 text-yellow-500"
                                : "bg-red-500/20 text-red-500"
                          }`}
                        >
                          {invoice.status === "paid" ? "Betaald" : invoice.status === "pending" ? "Openstaand" : "Verlopen"}
                        </span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10">
                          <Download className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Payment Method Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Betalingsmethode Toevoegen</DialogTitle>
            <DialogDescription>Voeg een nieuwe creditcard toe voor automatische betalingen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="card-name">Naam op kaart</Label>
              <Input
                id="card-name"
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                placeholder="Jan de Vries"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-number">Kaartnummer</Label>
              <Input
                id="card-number"
                value={cardNumber.replace(/(.{4})/g, "$1 ").trim()}
                onChange={(e) => {
                  const value = e.target.value.replace(/\s/g, "").slice(0, 16);
                  setCardNumber(value);
                }}
                placeholder="1234 5678 9012 3456"
                maxLength={19}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="card-expiry">Vervaldatum</Label>
                <Input
                  id="card-expiry"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                  placeholder="MM/JJ"
                  maxLength={5}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="card-cvc">CVC</Label>
                <Input
                  id="card-cvc"
                  value={cardCVC}
                  onChange={(e) => setCardCVC(e.target.value.slice(0, 3))}
                  placeholder="123"
                  maxLength={3}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CreditCard className="w-4 h-4" />
              <span>Betalingen worden veilig verwerkt via Stripe</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Annuleren
            </Button>
            <Button variant="hero" onClick={handlePayment}>
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Plan Dialog (Admin only) */}
      <Dialog open={changePlanDialogOpen} onOpenChange={setChangePlanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abonnement Wijzigen</DialogTitle>
            <DialogDescription>
              Weet je zeker dat je het abonnement voor {selectedOrganization?.name} wilt wijzigen naar{" "}
              {plans.find((p) => p.id === newPlan)?.name}?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label>Nieuw abonnement</Label>
              <Select
                value={newPlan}
                onValueChange={(value: "starter" | "professional" | "enterprise") => setNewPlan(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter - --/maand</SelectItem>
                  <SelectItem value="professional">Professional - --/maand</SelectItem>
                  <SelectItem value="enterprise">Enterprise - --</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePlanDialogOpen(false)}>
              Annuleren
            </Button>
            <Button variant="hero" onClick={confirmPlanChange}>
              Wijzigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BillingView;

