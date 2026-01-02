'use client';

import { useState, useEffect, useRef } from "react";
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
  Flag,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

export default function DashboardPage() {
  const { user, logout, loading, supabaseUser } = useAuth();
  const router = useRouter();
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
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null);
  const [techniciansCanViewDocuments, setTechniciansCanViewDocuments] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check for invite hash fragments - if present, redirect to auth to set password
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const type = params.get('type');
      
      if (type === 'invite' || type === 'recovery') {
        // Redirect to auth page with hash fragment to set password
        router.replace(`/auth${hash}`);
        return;
      }
    }
  }, [router]);

  // Redirect naar login als niet ingelogd
  // Check both user and supabaseUser - if we have supabaseUser but not user yet,
  // that's OK (user data is loading in background)
  useEffect(() => {
    if (!loading && !user && !supabaseUser) {
      router.push("/auth");
    }
  }, [user, supabaseUser, loading, router]);

  // Load organizations for admin selector
  useEffect(() => {
    if (user?.role === "admin") {
      loadOrganizations();
    }
  }, [user?.role]);

  // Load organization settings to check if technicians can view documents
  useEffect(() => {
    if (user?.organization_id) {
      loadOrganizationSettings();
    }
  }, [user?.organization_id]);

  const loadOrganizationSettings = async () => {
    if (!user?.organization_id) return;

    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("technicians_can_view_documents")
        .eq("id", user.organization_id)
        .single();

      if (error) throw error;

      if (data) {
        setTechniciansCanViewDocuments(data.technicians_can_view_documents || false);
      }
    } catch (error) {
      console.error("Error loading organization settings:", error);
    }
  };

  const loadOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name", { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const orgs = data as { id: string; name: string }[];
        console.log("Organizations loaded:", orgs);
        setOrganizations(orgs);
        // Set first organization as default if none selected
        if (!adminSelectedOrgId && orgs[0]) {
          console.log("Setting default organization to:", orgs[0].id, orgs[0].name);
          setAdminSelectedOrgId(orgs[0].id);
        }
      }
    } catch (error) {
      console.error("Error loading organizations:", error);
    }
  };

  // Get effective organization ID (selected org for admin, user's org for others)
  const effectiveOrgId = user?.role === "admin" ? (adminSelectedOrgId || null) : (user?.organization_id || null);


  // Generate a unique conversation ID using UUID v4 with additional guarantees
  // UUID v4 is already extremely unique (1 in 2^122 chance of collision)
  // We add user_id hash and timestamp to the random bytes for extra uniqueness
  const createConversationId = () => {
    // Get user ID for additional uniqueness context
    const userId = user?.id || 'anonymous';
    const timestamp = Date.now();
    
    // Generate cryptographically secure random bytes
    const getRandomValues =
      typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"
        ? (crypto.getRandomValues.bind(crypto) as (buf: Uint8Array) => Uint8Array)
        : null;

    const bytes = new Uint8Array(16);
    if (getRandomValues) {
      getRandomValues(bytes);
    } else {
      // Fallback: use Math.random with timestamp and user ID for seeding
      const seed = timestamp + userId.charCodeAt(0) + (userId.length * 1000);
      for (let i = 0; i < 16; i++) {
        bytes[i] = Math.floor((Math.random() * 256 + seed + i) % 256);
      }
    }

    // Incorporate user ID hash into first few bytes for additional uniqueness
    // This ensures different users get different conversation IDs even if timestamps are close
    let userHash = 0;
    for (let i = 0; i < Math.min(userId.length, 8); i++) {
      userHash = ((userHash << 5) - userHash) + userId.charCodeAt(i);
      userHash = userHash & userHash; // Convert to 32-bit integer
    }
    bytes[0] = (bytes[0] ^ (userHash & 0xFF)) & 0xFF;
    bytes[1] = (bytes[1] ^ ((userHash >> 8) & 0xFF)) & 0xFF;

    // Incorporate timestamp into bytes for session uniqueness
    const timeBytes = timestamp & 0xFFFFFFFF;
    bytes[2] = (bytes[2] ^ (timeBytes & 0xFF)) & 0xFF;
    bytes[3] = (bytes[3] ^ ((timeBytes >> 8) & 0xFF)) & 0xFF;

    // Per RFC 4122 section 4.4 - UUID v4 format
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

    const toHex = (n: number) => n.toString(16).padStart(2, "0");
    const b = Array.from(bytes, toHex).join("");

    // Return valid UUID v4 format
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

  // Generate new conversation ID per organization on each mount/login
  // This ensures each session starts with a fresh chat (no persistent history)
  useEffect(() => {
    if (!effectiveOrgId) {
      setConversationId(null);
      return;
    }

    // Always generate a new conversation ID for each session
    // This ensures chat is empty on each login
    const newId = createConversationId();
    setConversationId(newId);
  }, [effectiveOrgId]);

  // Load chat messages
  useEffect(() => {
    if (effectiveOrgId && conversationId && activeTab === "chat") {
      loadMessages();
    }
  }, [effectiveOrgId, activeTab, conversationId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const loadMessages = async () => {
    if (!effectiveOrgId || !conversationId || !user) return;

    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("organization_id", effectiveOrgId)
        .eq("user_id", user.id) // Filter by user_id to ensure unique history per user
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
            content: "Welkom bij Juko bot! Stel gerust een vraag over uw technische documentatie.",
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

      // Call chat via Next.js API route
      let aiResponse: string;
      try {
        const { sendChatMessage } = await import('@/lib/chat');
        const chatResponse = await sendChatMessage({
          question: userMessageContent,
          organizationId: effectiveOrgId,
          userId: user!.id,
          conversationId,
        });

        if (!chatResponse.success) {
          throw new Error(chatResponse.error || 'Chat processing failed');
        }

        aiResponse = chatResponse.response || 'Sorry, ik kon geen antwoord genereren.';

        // Log metadata if available
        if (chatResponse.metadata) {
          console.log('[Chat] Metadata:', chatResponse.metadata);
        }

        // Token usage is already tracked by the API route
        // The API route handles token tracking internally

        // Save AI response to database
        const { data: aiMessage, error: aiError } = await (supabase
          .from("chat_messages") as any)
          .insert({
            organization_id: effectiveOrgId,
            conversation_id: conversationId,
            user_id: user!.id, // IMPORTANT: Include user_id for assistant messages too
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
        console.error('Error calling chat:', chatError);
        
        const errorMessage = chatError.message || "Er is een fout opgetreden bij het genereren van het antwoord.";
        const fallbackResponse = "Sorry, ik kon geen antwoord genereren. Er is een fout opgetreden bij het verwerken van je vraag.";
        
        const { data: aiMessage } = await (supabase
          .from("chat_messages") as any)
          .insert({
            organization_id: effectiveOrgId,
            conversation_id: conversationId,
            user_id: user!.id, // IMPORTANT: Include user_id for assistant messages too
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
          description: errorMessage,
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

  const handleReportError = async (messageId: string, messageContent: string) => {
    if (!user || !effectiveOrgId || reportingMessageId === messageId) return;

    setReportingMessageId(messageId);
    try {
      const response = await fetch('/api/report-error', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId,
          messageContent,
          userId: user.id,
          organizationId: effectiveOrgId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to report error');
      }

      toast({
        title: "Bedankt!",
        description: "Het foute antwoord is gerapporteerd. We zullen dit bekijken.",
      });
    } catch (error: any) {
      console.error('Error reporting incorrect answer:', error);
      toast({
        title: "Fout",
        description: error.message || "Er is een fout opgetreden bij het rapporteren.",
        variant: "destructive",
      });
    } finally {
      setReportingMessageId(null);
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
    { 
      id: "documents", 
      icon: FileText, 
      label: "Documenten", 
      roles: ["admin", "manager", ...(techniciansCanViewDocuments ? ["technician"] : [])] 
    },
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
            <Link href="/" className="flex items-center gap-2">
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
                router.push("/auth");
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
              <Select 
                value={adminSelectedOrgId || ""} 
                onValueChange={(value) => {
                  console.log("Admin selected organization:", value);
                  setAdminSelectedOrgId(value);
                }}
              >
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
        <div className="flex-1 p-4 lg:p-8 overflow-hidden flex flex-col">
          {activeTab === "chat" && (
            <div className="h-full flex flex-col max-w-4xl mx-auto w-full">
              {/* Chat Header */}
              <div className="mb-4 flex items-center justify-between gap-3 flex-shrink-0">
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

              {/* Messages - Scrollable container with fixed height */}
              <div 
                className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0 pr-2"
                style={{ maxHeight: 'calc(100vh - 280px)' }}
              >
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex flex-col ${
                      message.role === "user" ? "items-end" : "items-start"
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
                    {message.role === "assistant" && message.id !== "welcome" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => handleReportError(message.id, message.content)}
                        disabled={reportingMessageId === message.id}
                      >
                        <Flag className="h-3 w-3 mr-1.5" />
                        {reportingMessageId === message.id ? "Rapporteren..." : "Rapporteer fout antwoord"}
                      </Button>
                    )}
                  </div>
                ))}
                {/* Invisible element to scroll to */}
                <div ref={messagesEndRef} />
              </div>

              {/* Input - Fixed at bottom */}
              <div className="flex items-center gap-3 flex-shrink-0 pt-2">
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
}






