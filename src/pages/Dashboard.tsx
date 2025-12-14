import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  MessageSquare,
  FileText,
  Users,
  Settings,
  LogOut,
  Send,
  BarChart,
  CreditCard,
  Building,
  Menu,
  Coins,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import OrganizationsView from "@/components/dashboard/OrganizationsView";
import UsersView from "@/components/dashboard/UsersView";
import AnalyticsView from "@/components/dashboard/AnalyticsView";
import DocumentsView from "@/components/dashboard/DocumentsView";
import BillingView from "@/components/dashboard/BillingView";
import SettingsView from "@/components/dashboard/SettingsView";
import TokenUsageView from "@/components/dashboard/TokenUsageView";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { generateEmbedding, generateAIResponse } from "@/lib/openai";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const Dashboard = () => {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [adminSelectedOrgId, setAdminSelectedOrgId] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);

  // Redirect naar login als niet ingelogd
  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  // Load organizations for admin selector
  useEffect(() => {
    if (user?.role === "admin") {
      loadOrganizations();
    }
  }, [user?.role]);

  const loadOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name", { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        setOrganizations(data);
        // Set first organization as default if none selected
        if (!adminSelectedOrgId) {
          setAdminSelectedOrgId(data[0].id);
        }
      }
    } catch (error) {
      console.error("Error loading organizations:", error);
    }
  };

  // Get effective organization ID (selected org for admin, user's org for others)
  const effectiveOrgId = user?.role === "admin" ? adminSelectedOrgId : user?.organization_id || null;

  // Load chat messages
  useEffect(() => {
    if (effectiveOrgId && activeTab === "chat") {
      loadMessages();
    }
  }, [effectiveOrgId, activeTab]);

  const loadMessages = async () => {
    if (!effectiveOrgId) return;

    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("organization_id", effectiveOrgId)
        .order("created_at", { ascending: true })
        .limit(50);

      if (error) throw error;

      if (data && data.length > 0) {
        setMessages(
          data.map((msg) => ({
            id: msg.id,
            role: msg.role as "user" | "assistant",
            content: msg.content,
          }))
        );
      } else {
        // Welcome message if no messages
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content: "Welkom bij TechRAG! Stel gerust een vraag over uw technische documentatie.",
          },
        ]);
      }
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !effectiveOrgId || isSending) return;

    const userMessageContent = inputValue.trim();
    setInputValue("");
    setIsSending(true);

    // Add user message to UI immediately
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: userMessageContent,
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      // Save user message to database
      const { data: savedMessage, error: saveError } = await supabase
        .from("chat_messages")
        .insert({
          organization_id: effectiveOrgId,
          user_id: user!.id,
          role: "user",
          content: userMessageContent,
        })
        .select()
        .single();

      if (saveError) throw saveError;

      // Update message with real ID
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === userMessage.id ? { ...msg, id: savedMessage.id } : msg
        )
      );

      // Track analytics with question text
      await supabase.from("analytics").insert({
        organization_id: effectiveOrgId,
        event_type: "question_asked",
        event_data: { 
          question_text: userMessageContent,
          question_length: userMessageContent.length 
        },
      });

      // RAG: Generate embedding for question and search for relevant document sections
      let context = "";
      try {
        const queryEmbedding = await generateEmbedding(
          userMessageContent,
          effectiveOrgId,
          user!.id
        );
        
        const { data: relevantSections, error: searchError } = await supabase.rpc(
          'match_document_sections',
          {
            p_organization_id: effectiveOrgId,
            query_embedding: queryEmbedding,
            match_count: 5,
            match_threshold: 0.7,
          }
        );

        if (!searchError && relevantSections && relevantSections.length > 0) {
          // Combine relevant sections as context
          context = relevantSections
            .map((section: any) => section.content)
            .join('\n\n');
        }
      } catch (embeddingError) {
        console.error('Error generating embedding or searching:', embeddingError);
        // Continue without context if embedding fails
      }

      // Generate AI response with RAG context
      try {
        const aiResponse = await generateAIResponse(
          userMessageContent,
          context,
          effectiveOrgId,
          user!.id
        );

        const { data: aiMessage, error: aiError } = await supabase
          .from("chat_messages")
          .insert({
            organization_id: effectiveOrgId,
            role: "assistant",
            content: aiResponse,
          })
          .select()
          .single();

        if (!aiError && aiMessage) {
          setMessages((prev) => [
            ...prev,
            {
              id: aiMessage.id,
              role: "assistant",
              content: aiResponse,
            },
          ]);
        }
      } catch (aiError: any) {
        console.error('Error generating AI response:', aiError);
        // Fallback response
        const fallbackResponse = "Sorry, ik kon geen antwoord genereren. Zorg ervoor dat je OpenAI API key is ingesteld en dat er documenten zijn geüpload.";
        
        const { data: aiMessage } = await supabase
          .from("chat_messages")
          .insert({
            organization_id: effectiveOrgId,
            role: "assistant",
            content: fallbackResponse,
          })
          .select()
          .single();

        if (aiMessage) {
          setMessages((prev) => [
            ...prev,
            {
              id: aiMessage.id,
              role: "assistant",
              content: fallbackResponse,
            },
          ]);
        }
      } finally {
        setIsSending(false);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Fout",
        description: "Er is een fout opgetreden bij het verzenden van je bericht.",
        variant: "destructive",
      });
      setIsSending(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Laden...</div>
      </div>
    );
  }

  const currentRole: UserRole = user.role;

  const menuItems = [
    { id: "chat", icon: MessageSquare, label: "Chat", roles: ["admin", "manager", "technician"] },
    { id: "documents", icon: FileText, label: "Documenten", roles: ["admin", "manager"] },
    { id: "users", icon: Users, label: "Gebruikers", roles: ["admin", "manager"] },
    { id: "organizations", icon: Building, label: "Organisaties", roles: ["admin"] },
    { id: "analytics", icon: BarChart, label: "Analytics", roles: ["admin", "manager"] },
    { id: "token-usage", icon: Coins, label: "Token Gebruik", roles: ["admin"] },
    { id: "billing", icon: CreditCard, label: "Facturatie", roles: ["admin", "manager"] },
    { id: "settings", icon: Settings, label: "Instellingen", roles: ["admin", "manager"] },
  ];

  const filteredMenuItems = menuItems.filter((item) =>
    item.roles.includes(currentRole)
  );

  return (
    <div className="min-h-screen flex">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 glass border-r border-border/30 transform transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-4 border-b border-border/30">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-[hsl(15_80%_55%)] flex items-center justify-center">
                <Bot className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="font-display text-xl font-bold text-foreground">
                Tech<span className="text-gradient">RAG</span>
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {filteredMenuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === item.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>

          {/* User Info */}
          <div className="p-4 border-t border-border/30">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="font-display font-bold text-primary text-sm">
                  {currentRole === "admin" ? "AD" : currentRole === "manager" ? "MG" : "MT"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{currentRole}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                logout();
                navigate("/auth");
              }}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Uitloggen
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-4 border-b border-border/30 glass">
          <button onClick={() => setSidebarOpen(true)} className="p-2">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-display font-semibold text-foreground">
            {filteredMenuItems.find((i) => i.id === activeTab)?.label}
          </span>
          <div className="w-10" />
        </header>

        {/* Admin Organization Selector */}
        {user?.role === "admin" && organizations.length > 0 && (
          <div className="p-4 lg:p-8 pb-0 border-b border-border/30">
            <div className="flex items-center gap-3">
              <Building className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Bekijk als:</span>
              <Select value={adminSelectedOrgId || ""} onValueChange={setAdminSelectedOrgId}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Selecteer organisatie" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 p-4 lg:p-8">
          {activeTab === "chat" && (
            <div className="h-full flex flex-col max-w-4xl mx-auto">
              {/* Chat Header */}
              <div className="mb-6">
                <h1 className="font-display text-2xl font-bold text-foreground">
                  AI Assistent
                </h1>
                <p className="text-muted-foreground">
                  Stel vragen over uw technische documentatie
                </p>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        message.role === "user"
                          ? "bg-primary/20 rounded-br-md"
                          : "glass rounded-bl-md"
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="flex items-center gap-3">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Stel een vraag..."
                  className="flex-1"
                />
                <Button variant="hero" size="icon" onClick={handleSendMessage} disabled={isSending || !inputValue.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {activeTab === "documents" && <DocumentsView selectedOrganizationId={effectiveOrgId} />}

          {activeTab === "users" && <UsersView currentRole={currentRole} selectedOrganizationId={effectiveOrgId} />}

          {activeTab === "organizations" && <OrganizationsView />}

          {activeTab === "analytics" && <AnalyticsView currentRole={currentRole} selectedOrganizationId={effectiveOrgId} />}

          {activeTab === "token-usage" && <TokenUsageView selectedOrganizationId={effectiveOrgId} />}

          {activeTab === "billing" && <BillingView selectedOrganizationId={effectiveOrgId} />}

          {activeTab === "settings" && <SettingsView />}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
