import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { Link } from "react-router-dom";
import OrganizationsView from "@/components/dashboard/OrganizationsView";
import UsersView from "@/components/dashboard/UsersView";
import AnalyticsView from "@/components/dashboard/AnalyticsView";
import DocumentsView from "@/components/dashboard/DocumentsView";

// Simulated user role - will come from auth
type UserRole = "admin" | "manager" | "technician";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const Dashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentRole] = useState<UserRole>("technician"); // Will come from auth
  const [activeTab, setActiveTab] = useState("chat");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Welkom bij TechRAG! Stel gerust een vraag over uw technische documentatie.",
    },
  ]);
  const [inputValue, setInputValue] = useState("");

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
    };

    setMessages([...messages, userMessage]);
    setInputValue("");

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Dit is een placeholder antwoord. Verbind met Lovable Cloud om de volledige RAG-functionaliteit te activeren.",
      };
      setMessages((prev) => [...prev, aiMessage]);
    }, 1000);
  };

  const menuItems = [
    { id: "chat", icon: MessageSquare, label: "Chat", roles: ["admin", "manager", "technician"] },
    { id: "documents", icon: FileText, label: "Documenten", roles: ["admin", "manager"] },
    { id: "users", icon: Users, label: "Gebruikers", roles: ["admin", "manager"] },
    { id: "organizations", icon: Building, label: "Organisaties", roles: ["admin"] },
    { id: "analytics", icon: BarChart, label: "Analytics", roles: ["admin", "manager"] },
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
                <p className="font-medium text-foreground truncate">Demo Gebruiker</p>
                <p className="text-xs text-muted-foreground capitalize">{currentRole}</p>
              </div>
            </div>
            <Link to="/">
              <Button variant="outline" size="sm" className="w-full">
                <LogOut className="w-4 h-4 mr-2" />
                Uitloggen
              </Button>
            </Link>
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
                <Button variant="hero" size="icon" onClick={handleSendMessage}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {activeTab === "documents" && <DocumentsView />}

          {activeTab === "users" && <UsersView currentRole={currentRole} />}

          {activeTab === "organizations" && <OrganizationsView />}

          {activeTab === "analytics" && <AnalyticsView currentRole={currentRole} />}

          {activeTab === "billing" && (
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground mb-2">
                Facturatie
              </h1>
              <p className="text-muted-foreground mb-6">
                Beheer uw abonnement en facturen
              </p>

              <div className="glass rounded-2xl p-8 text-center">
                <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Verbind met Lovable Cloud en Stripe om facturatie te beheren.
                </p>
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground mb-2">
                Instellingen
              </h1>
              <p className="text-muted-foreground mb-6">
                Beheer uw account en voorkeuren
              </p>

              <div className="glass rounded-2xl p-8 text-center">
                <Settings className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Verbind met Lovable Cloud om instellingen te beheren.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
