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
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

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
  const [isClearing, setIsClearing] = useState(false);
  const [adminSelectedOrgId, setAdminSelectedOrgId] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);

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
        const orgs = data as { id: string; name: string }[];
        setOrganizations(orgs);
        // Set first organization as default if none selected
        if (!adminSelectedOrgId && orgs[0]) {
          setAdminSelectedOrgId(orgs[0].id);
        }
      }
    } catch (error) {
      console.error("Error loading organizations:", error);
    }
  };

  // Get effective organization ID (selected org for admin, user's org for others)
  const effectiveOrgId = user?.role === "admin" ? adminSelectedOrgId : user?.organization_id || null;

  const isValidUuid = (value: string | null) => {
    if (!value) return false;
    // Simple UUID v4/UUID regex
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  };

  // Generate a valid UUID v4 string for conversation_id (Postgres uuid type)
  const createConversationId = () => {
    // Prefer native crypto.randomUUID when available
    if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
      return (crypto as any).randomUUID() as string;
    }

    // Fallback: manual UUID v4 generator
    const getRandomValues =
      typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"
        ? (crypto.getRandomValues.bind(crypto) as (buf: Uint8Array) => Uint8Array)
        : null;

    const bytes = new Uint8Array(16);
    if (getRandomValues) {
      getRandomValues(bytes);
    } else {
      for (let i = 0; i < 16; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }

    // Per RFC 4122 section 4.4
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

    const toHex = (n: number) => n.toString(16).padStart(2, "0");
    const b = Array.from(bytes, toHex).join("");

    return (
      b.slice(0, 8) +
      "-" +
      b.slice(8, 12) +
      "-" +
      b.slice(12, 16) +
      "-" +
      b.slice(16, 20) +
      "-" +
      b.slice(20, 32)
    );
  };

  // Initialize or restore conversation ID per organization
  useEffect(() => {
    if (!effectiveOrgId) {
      setConversationId(null);
      return;
    }

    const storageKey = `chatConversationId_${effectiveOrgId}`;
    const existing = localStorage.getItem(storageKey);
    if (isValidUuid(existing)) {
      setConversationId(existing as string);
      return;
    }

    const newId = createConversationId();
    localStorage.setItem(storageKey, newId);
    setConversationId(newId);
  }, [effectiveOrgId]);

  // Load chat messages
  useEffect(() => {
    if (effectiveOrgId && conversationId && activeTab === "chat") {
      loadMessages();
    }
  }, [effectiveOrgId, activeTab, conversationId]);

  const loadMessages = async () => {
    if (!effectiveOrgId || !conversationId) return;

    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("organization_id", effectiveOrgId)
        // conversation-based geschiedenis
        .eq("conversation_id", conversationId as any)
        .order("created_at", { ascending: true })
        .limit(50);

      if (error) throw error;

      if (data && data.length > 0) {
        setMessages(
          (data as any[]).map((msg) => ({
            id: (msg as any).id,
            role: (msg as any).role as "user" | "assistant",
            content: (msg as any).content as string,
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
    if (!inputValue.trim() || !effectiveOrgId || !conversationId || isSending) return;

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
      const { data: savedMessage, error: saveError } = await (supabase
        .from("chat_messages") as any)
        .insert({
          organization_id: effectiveOrgId,
          conversation_id: conversationId,
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
      await (supabase.from("analytics") as any).insert({
        organization_id: effectiveOrgId,
        event_type: "question_asked",
        event_data: { 
          question_text: userMessageContent,
          question_length: userMessageContent.length 
        },
      });

      // Call Edge Function for chat completion with RAG
      // This ensures organization-specific document access and keeps API keys secure
      let aiResponse: string;
      try {
        const { data, error } = await supabase.functions.invoke('chat', {
          body: {
            question: userMessageContent,
            organizationId: effectiveOrgId,
            userId: user!.id,
            conversationId,
          },
        });

        if (error) {
          throw new Error(error.message || 'Failed to call chat function');
        }

        if (!data?.success) {
          throw new Error(data?.error || 'Chat function returned an error');
        }

        aiResponse = data.response || 'Sorry, ik kon geen antwoord genereren.';

        // Log debug info if available
        if (data.debug) {
          console.log('[Chat] Debug info:', {
            usedRAG: data.usedRAG,
            hasDocuments: data.hasDocuments,
            hasContext: data.hasContext,
            contextLength: data.contextLength,
            embeddingGenerated: data.debug.embeddingGenerated,
            sectionsFound: data.debug.sectionsFound,
          });
        }

        // Save AI response to database
        const { data: aiMessage, error: aiError } = await (supabase
          .from("chat_messages") as any)
          .insert({
            organization_id: effectiveOrgId,
            conversation_id: conversationId,
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
      } catch (chatError: any) {
        console.error('Error calling chat function:', chatError);
        
        // Fallback response
        const fallbackResponse = "Sorry, ik kon geen antwoord genereren. Zorg ervoor dat de Edge Function is geconfigureerd en dat er documenten zijn geüpload.";
        
        const { data: aiMessage } = await (supabase
          .from("chat_messages") as any)
          .insert({
            organization_id: effectiveOrgId,
            conversation_id: conversationId,
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

        toast({
          title: "Fout",
          description: chatError.message || "Er is een fout opgetreden bij het genereren van het antwoord.",
          variant: "destructive",
        });
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

  const handleClearChat = async () => {
    if (!effectiveOrgId || !conversationId || isClearing) return;

    setIsClearing(true);
    try {
      // Delete only messages from current conversation
      const { error } = await supabase
        .from("chat_messages")
        .delete()
        .eq("organization_id", effectiveOrgId)
        .eq("conversation_id", conversationId);

      if (error) throw error;

      // Generate new conversation ID
      const newConversationId = createConversationId();
      const storageKey = `chatConversationId_${effectiveOrgId}`;
      localStorage.setItem(storageKey, newConversationId);
      setConversationId(newConversationId);

      // Clear messages and show welcome message
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "De chat is geleegd. Stel gerust een nieuwe vraag.",
        },
      ]);
    } catch (error) {
      console.error("Error clearing chat:", error);
      toast({
        title: "Fout",
        description: "De chat kon niet worden geleegd.",
        variant: "destructive",
      });
    } finally {
      setIsClearing(false);
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
              <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl font-bold text-foreground">
                    AI Assistent
                  </h1>
                  <p className="text-muted-foreground">
                    Stel vragen over uw technische documentatie
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearChat}
                  disabled={isClearing || messages.length === 0}
                >
                  Chat leegmaken
                </Button>
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
                      {message.role === "assistant" ? (
                        <MarkdownMessage content={message.content} />
                      ) : (
                        <p className="text-sm text-foreground whitespace-pre-wrap">{message.content}</p>
                      )}
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
