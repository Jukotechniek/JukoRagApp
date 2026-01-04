import { useState, useRef, useCallback, useEffect } from "react";
import { FileText, Upload, Search, MoreVertical, File, FileImage, FileSpreadsheet, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useToast } from "@/hooks/use-toast";
import { supabase, supabaseUrl } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { processDocumentForRAG } from "@/lib/document-processing";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Database } from "@/types/database";

type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

interface Document {
  id: string;
  name: string;
  type: "pdf" | "docx" | "xlsx" | "image";
  size: string;
  uploadedBy: string | null;
  uploadedAt: string;
  file_url: string | null;
  use_for_rag: boolean;
}

const typeIcons = {
  pdf: FileText,
  docx: File,
  xlsx: FileSpreadsheet,
  image: FileImage,
};

const typeColors = {
  pdf: "text-red-400",
  docx: "text-blue-400",
  xlsx: "text-green-400",
  image: "text-purple-400",
};

interface DocumentsViewProps {
  selectedOrganizationId?: string | null;
}

// Circular Progress Component
const CircularProgress = ({ value, size = 40, strokeWidth = 4 }: { value: number; size?: number; strokeWidth?: number }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  const textSize = size <= 32 ? 'text-[10px]' : 'text-xs';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-secondary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-primary transition-all duration-300"
        />
      </svg>
      <span className={`absolute ${textSize} font-medium text-foreground`}>
        {Math.round(value)}%
      </span>
    </div>
  );
};

const DocumentsView = ({ selectedOrganizationId }: DocumentsViewProps) => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [techniciansCanViewDocuments, setTechniciansCanViewDocuments] = useState(false);
  
  // Progress tracking - track by filename for uploads, by doc ID for RAG
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [ragProcessingProgress, setRagProcessingProgress] = useState<Record<string, boolean>>({});
  const [uploadingFiles, setUploadingFiles] = useState<Array<{ name: string; size: string }>>([]);

  // Use selected organization ID or fall back to user's organization
  const effectiveOrgId = selectedOrganizationId || user?.organization_id || null;

  // Check if user can edit (not a technician, or technician with permission)
  const canEdit = user?.role !== "technician" || techniciansCanViewDocuments;
  const isReadOnly = user?.role === "technician" && techniciansCanViewDocuments;

  // Load organization settings
  useEffect(() => {
    if (effectiveOrgId && user?.role === "technician") {
      loadOrganizationSettings();
    }
  }, [effectiveOrgId, user?.role]);

  const loadOrganizationSettings = async () => {
    if (!effectiveOrgId) return;

    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("technicians_can_view_documents")
        .eq("id", effectiveOrgId)
        .single();

      if (error) throw error;

      if (data) {
        setTechniciansCanViewDocuments(data.technicians_can_view_documents || false);
      }
    } catch (error) {
      console.error("Error loading organization settings:", error);
    }
  };

  // Load documents
  useEffect(() => {
    if (effectiveOrgId) {
      loadDocuments();
    } else {
      // If no org ID, clear documents
      setDocuments([]);
      setLoading(false);
    }
  }, [effectiveOrgId]);

  const loadDocuments = async () => {
    if (!effectiveOrgId) {
      setDocuments([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log("Loading documents for organization:", effectiveOrgId);
      console.log("User role:", user?.role);
      
      // For admins, use API route with service role to bypass RLS
      if (user?.role === "admin") {
        // Get the auth token from Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error("Not authenticated");
        }

        const response = await fetch("/api/get-documents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            organizationId: effectiveOrgId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to load documents");
        }

        const { documents } = await response.json();
        const data = documents;
        
        console.log("Documents loaded via API:", data?.length || 0, "for organization:", effectiveOrgId);
        
        if (data && data.length > 0) {
          const formattedDocs: Document[] = (data as (DocumentRow & { users?: { name: string } | null })[]).map((doc) => {
            // Determine file type from file_type
            let type: "pdf" | "docx" | "xlsx" | "image" = "pdf";
            if (doc.file_type.includes("word") || doc.file_type.includes("docx")) type = "docx";
            else if (doc.file_type.includes("spreadsheet") || doc.file_type.includes("xlsx")) type = "xlsx";
            else if (doc.file_type.includes("image")) type = "image";

            // Format size
            const sizeInMB = (doc.file_size / (1024 * 1024)).toFixed(1);
            const sizeString = sizeInMB === "0.0" ? `${(doc.file_size / 1024).toFixed(0)} KB` : `${sizeInMB} MB`;

            return {
              id: doc.id,
              name: doc.name,
              type,
              size: sizeString,
              uploadedBy: doc.users?.name || "Onbekend",
              uploadedAt: formatDistanceToNow(new Date(doc.created_at), { addSuffix: true, locale: nl }),
              file_url: doc.file_url,
              use_for_rag: doc.use_for_rag ?? false,
            };
          });

          setDocuments(formattedDocs);
        } else {
          setDocuments([]);
        }
        setLoading(false);
        return;
      }
      
      // For non-admin users, use regular Supabase query
      const { data, error } = await supabase
        .from("documents")
        .select(
          `
          *,
          users:uploaded_by (
            name
          )
        `
        )
        .eq("organization_id", effectiveOrgId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading documents:", error);
        throw error;
      }

      console.log("Documents loaded:", data?.length || 0, "for organization:", effectiveOrgId);
      if (data && data.length > 0) {
        console.log("Document details:", data);
      }

      if (data) {
        const formattedDocs: Document[] = (data as (DocumentRow & { users?: { name: string } | null })[]).map((doc) => {
          // Determine file type from file_type
          let type: "pdf" | "docx" | "xlsx" | "image" = "pdf";
          if (doc.file_type.includes("word") || doc.file_type.includes("docx")) type = "docx";
          else if (doc.file_type.includes("spreadsheet") || doc.file_type.includes("xlsx")) type = "xlsx";
          else if (doc.file_type.includes("image")) type = "image";

          // Format size
          const sizeInMB = (doc.file_size / (1024 * 1024)).toFixed(1);
          const sizeString = sizeInMB === "0.0" ? `${(doc.file_size / 1024).toFixed(0)} KB` : `${sizeInMB} MB`;

          return {
            id: doc.id,
            name: doc.name,
            type,
            size: sizeString,
            uploadedBy: doc.users?.name || "Onbekend",
            uploadedAt: formatDistanceToNow(new Date(doc.created_at), { addSuffix: true, locale: nl }),
            file_url: doc.file_url,
            use_for_rag: doc.use_for_rag ?? false,
          };
        });
        setDocuments(formattedDocs);
      } else {
        setDocuments([]);
      }
    } catch (error: any) {
      console.error("Error loading documents:", error);
      toast({
        title: "Fout",
        description: error.message || "Kon documenten niet laden.",
        variant: "destructive",
        duration: 5000,
      });
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !effectiveOrgId || !user) return;

    // Check if user can edit - technicians can never upload, only view
    if (user.role === "technician") {
      toast({
        title: "Geen toegang",
        description: "Monteurs kunnen geen documenten uploaden. Neem contact op met uw manager.",
        variant: "destructive",
      });
      return;
    }

    for (const file of Array.from(files)) {
      // Validate file is not empty
      if (file.size === 0) {
        toast({
          title: "Leeg bestand",
          description: `${file.name} is leeg. Upload alleen bestanden met inhoud.`,
          variant: "destructive",
          duration: 5000,
        });
        continue;
      }

      // Validate file type - only allow: Word (.docx), Notepad (.txt), Excel (.xls, .xlsx), PDF (.pdf)
      // Note: .doc files (old Word format) are not supported - users must convert to .docx
      const validTypes = [
        "text/plain", // .txt files
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
        "application/vnd.ms-excel", // .xls files
      ];
      
      // Also check file extension as fallback (some browsers don't set MIME type correctly)
      const fileExt = file.name.split(".").pop()?.toLowerCase();
      const validExtensions = ["txt", "pdf", "docx", "xls", "xlsx"];
      
      // Check for .doc files and provide helpful error message
      if (fileExt === "doc" || file.type === "application/msword") {
        toast({
          title: ".doc bestanden niet ondersteund",
          description: `${file.name} is een oud Word-formaat (.doc). Converteer het bestand naar .docx formaat en upload het opnieuw. Open het bestand in Microsoft Word en sla het op als .docx.`,
          variant: "destructive",
          duration: 5000,
        });
        continue;
      }
      
      if (!validTypes.includes(file.type) && !validExtensions.includes(fileExt || "")) {
        toast({
          title: "Ongeldig bestandstype",
          description: `${file.name} heeft een ongeldig type. Toegestaan: Word (.docx), Notepad (.txt), Excel (.xls, .xlsx), PDF (.pdf).`,
          variant: "destructive",
          duration: 5000,
        });
        continue;
      }

      // Validate file size (20MB max)
      if (file.size > 20 * 1024 * 1024) {
        toast({
          title: "Bestand te groot",
          description: `${file.name} is te groot. Maximum grootte is 20MB.`,
          variant: "destructive",
          duration: 5000,
        });
        continue;
      }

      // For text-based files, check if they have meaningful content (not just whitespace)
      const textBasedTypes = ["text/plain"];
      const textBasedExtensions = ["txt"];
      
      if (textBasedTypes.includes(file.type) || textBasedExtensions.includes(fileExt || "")) {
        try {
          // Clone the file to avoid consuming the stream
          const fileClone = file.slice(0, file.size, file.type);
          const text = await fileClone.text();
          // Check if file has meaningful content (at least some non-whitespace characters)
          const trimmedText = text.trim();
          if (trimmedText.length === 0) {
            toast({
              title: "Leeg bestand",
              description: `${file.name} bevat alleen lege regels. Upload alleen bestanden met inhoud.`,
              variant: "destructive",
              duration: 5000,
            });
            continue;
          }
        } catch (error) {
          // If we can't read the file, skip this validation but continue
          console.warn(`Could not validate content of ${file.name}:`, error);
        }
      }

      // Check if file with same name already exists
      const existingDoc = documents.find(doc => doc.name === file.name);
      if (existingDoc) {
        toast({
          title: "Bestand bestaat al",
          description: `Een bestand met de naam "${file.name}" bestaat al. Verwijder het bestaande bestand eerst of gebruik een andere naam.`,
          variant: "destructive",
          duration: 5000,
        });
        continue;
      }

      try {
        // Track progress by filename
        const fileNameKey = file.name;
        const fileSizeStr = file.size < 1024 
          ? `${file.size} B` 
          : file.size < 1024 * 1024 
          ? `${(file.size / 1024).toFixed(1)} KB` 
          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
        
        // Add to uploading files list
        setUploadingFiles((prev) => [...prev, { name: file.name, size: fileSizeStr }]);
        
        // Set initial upload progress
        setUploadProgress((prev) => ({ ...prev, [fileNameKey]: 0 }));

        // Upload to Supabase Storage with progress tracking
        const fileExt = file.name.split(".").pop();
        const fileName = `${effectiveOrgId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Estimate upload time based on file size (rough estimate: 1MB per second)
        const estimatedUploadTime = Math.max(1000, (file.size / (1024 * 1024)) * 1000);
        const progressInterval = 100; // Update every 100ms
        const progressIncrement = (progressInterval / estimatedUploadTime) * 100;
        
        // Start progress simulation
        let currentProgress = 0;
        const progressTimer = setInterval(() => {
          currentProgress = Math.min(currentProgress + progressIncrement, 90); // Cap at 90% until upload completes
          setUploadProgress((prev) => ({ ...prev, [fileNameKey]: currentProgress }));
        }, progressInterval);

        // Perform actual upload
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(fileName, file);

        clearInterval(progressTimer);

        if (uploadError) {
          setUploadProgress((prev) => {
            const newPrev = { ...prev };
            delete newPrev[fileNameKey];
            return newPrev;
          });
          throw uploadError;
        }

        // Complete upload progress
        setUploadProgress((prev) => ({ ...prev, [fileNameKey]: 100 }));

        // Construct storage URL without /public/ (direct storage access)
        const storageUrl = `${supabaseUrl}/storage/v1/object/documents/${encodeURIComponent(fileName)}`;

        // Save document metadata to database
        const { error: dbError } = await (supabase
          .from("documents") as any)
          .insert({
            organization_id: effectiveOrgId,
            name: file.name,
            file_type: file.type,
            file_size: file.size,
            file_url: storageUrl,
            uploaded_by: user.id,
            use_for_rag: false, // Default: niet gebruiken voor RAG
          })
          .select()
          .single();

        if (dbError) throw dbError;

        // Track analytics
        await (supabase.from("analytics") as any).insert({
          organization_id: effectiveOrgId,
          event_type: "document_uploaded",
          event_data: { file_name: file.name, file_size: file.size },
        });

        // Remove from uploading files immediately and clear progress
        setUploadingFiles((prev) => prev.filter(f => f.name !== file.name));
        setUploadProgress((prev) => {
          const newPrev = { ...prev };
          delete newPrev[fileNameKey];
          return newPrev;
        });

        toast({
          title: "Document geüpload",
          description: `${file.name} is succesvol geüpload. Zet RAG aan om het document te gebruiken in de chat.`,
          duration: 3000, // Auto-dismiss after 3 seconds
        });

        // Document wordt niet automatisch verwerkt - gebruiker moet RAG aanzetten

        // Reload documents
        await loadDocuments();
      } catch (error: any) {
        // Clear progress on error - find by filename
        const fileNameKey = file.name;
        setUploadProgress((prev) => {
          const newPrev = { ...prev };
          delete newPrev[fileNameKey];
          return newPrev;
        });
        setUploadingFiles((prev) => prev.filter(f => f.name !== file.name));
        toast({
          title: "Upload mislukt",
          description: error.message || "Er is een fout opgetreden bij het uploaden.",
          variant: "destructive",
          duration: 5000,
        });
      }
    }
  }, [toast, user, effectiveOrgId, documents]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDelete = (doc: Document) => {
    if (!canEdit) {
      toast({
        title: "Geen toegang",
        description: "U heeft geen toestemming om documenten te verwijderen.",
        variant: "destructive",
      });
      return;
    }
    setDocumentToDelete(doc);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!documentToDelete || !effectiveOrgId || !canEdit) return;

    try {
      // 1) Verwijder alle gekoppelde embeddings (document_sections)
      const { error: sectionsError } = await supabase
        .from("document_sections")
        .delete()
        .eq("document_id", documentToDelete.id);

      if (sectionsError) {
        console.error("Error deleting document sections:", sectionsError);
      }

      // 2) Verwijder document record zelf
      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentToDelete.id)
        .eq("organization_id", effectiveOrgId);

      if (dbError) throw dbError;

      // Delete from storage if URL exists
      if (documentToDelete.file_url) {
        try {
          // Extract storage path from URL
          // URL format: https://xxx.supabase.co/storage/v1/object/documents/org-id/timestamp-random.ext
          const urlMatch = documentToDelete.file_url.match(/\/documents\/(.+)$/);
          if (urlMatch && urlMatch[1]) {
            // Decode URL-encoded path
            const storagePath = decodeURIComponent(urlMatch[1]);
            const { error: storageError } = await supabase.storage
              .from("documents")
              .remove([storagePath]);
            
            if (storageError) {
              console.error("Error deleting file from storage:", storageError);
              // Don't throw - we've already deleted from DB, just log the error
            }
          }
        } catch (error) {
          console.error("Error extracting storage path from URL:", error);
          // Don't throw - we've already deleted from DB, just log the error
        }
      }

      toast({
        title: "Document verwijderd",
        description: `${documentToDelete.name} is verwijderd.`,
        duration: 3000,
      });

      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
      await loadDocuments();
    } catch (error: any) {
      toast({
        title: "Verwijderen mislukt",
        description: error.message || "Er is een fout opgetreden.",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  const handleDownload = async (doc: Document) => {
    if (!doc.file_url) {
      toast({
        title: "Geen downloadlink",
        description: "Er is geen bestand gekoppeld aan dit document.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }

    try {
      // Probeer storage-pad uit de opgeslagen URL te halen
      const match = doc.file_url.match(/\/documents\/(.+)$/);
      let urlToOpen = doc.file_url;

      if (match && match[1]) {
        const storagePath = decodeURIComponent(match[1]);
        const { data, error } = await supabase.storage
          .from("documents")
          .createSignedUrl(storagePath, 60 * 10); // 10 minuten geldig

        if (error) {
          console.error("Error creating signed URL:", error);
        } else if (data?.signedUrl) {
          urlToOpen = data.signedUrl;
        }
      }

      window.open(urlToOpen, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download mislukt",
        description: "Het bestand kon niet worden geopend.",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  const handleToggleRAG = async (doc: Document, newValue: boolean) => {
    if (!canEdit) {
      toast({
        title: "Geen toegang",
        description: "U heeft geen toestemming om RAG instellingen te wijzigen.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (!effectiveOrgId) {
        toast({
          title: "Fout",
          description: "Geen organisatie geselecteerd.",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase
        .from("documents")
        .update({ use_for_rag: newValue })
        .eq("id", doc.id)
        .eq("organization_id", effectiveOrgId)
        .select();

      if (error) {
        console.error("Error updating use_for_rag:", error);
        throw error;
      }

      if (!data || data.length === 0) {
        throw new Error("Geen document gevonden om te updaten");
      }

      // Update local state
      setDocuments((prevDocs) =>
        prevDocs.map((d) => (d.id === doc.id ? { ...d, use_for_rag: newValue } : d))
      );

      if (newValue) {
        // RAG ingeschakeld - verwerk document voor RAG
        setRagProcessingProgress((prev) => ({ ...prev, [doc.id]: true }));

        toast({
          title: "RAG ingeschakeld",
          description: `${doc.name} wordt verwerkt voor RAG...`,
          duration: 2000,
        });

        try {
          if (!effectiveOrgId) {
            throw new Error("Geen organisatie geselecteerd");
          }
          await processDocumentForRAG(doc.id, effectiveOrgId);
          
          // Clear progress
          setRagProcessingProgress((prev) => {
            const newPrev = { ...prev };
            delete newPrev[doc.id];
            return newPrev;
          });
          
          toast({
            title: "✅ Document verwerkt",
            description: `${doc.name} is verwerkt en klaar voor gebruik in de chat.`,
            duration: 3000,
          });
        } catch (error: any) {
          console.error(`Document processing failed for ${doc.name}:`, error);
          setRagProcessingProgress((prev) => {
            const newPrev = { ...prev };
            delete newPrev[doc.id];
            return newPrev;
          });
          
          // Get error message - show user-friendly message
          const errorMessage = error?.message || error?.toString() || 'Onbekende fout';
          
          toast({
            title: "⚠️ RAG ingeschakeld, maar verwerking mislukt",
            description: `${doc.name} is ingeschakeld voor RAG, maar verwerking is mislukt. ${errorMessage.includes('timeout') ? 'Het bestand is mogelijk te groot.' : ''} Controleer de console voor meer details.`,
            variant: "destructive",
            duration: 7000, // Longer duration to give user time to read
          });
        }
      } else {
        // RAG uitgeschakeld - verwijder document sections (embeddings)
        const { error: sectionsError } = await supabase
          .from("document_sections")
          .delete()
          .eq("document_id", doc.id);

        if (sectionsError) {
          console.error("Error deleting document sections:", sectionsError);
        }

        toast({
          title: "RAG uitgeschakeld",
          description: `${doc.name} wordt niet meer gebruikt voor RAG queries. Embeddings zijn verwijderd.`,
          duration: 3000,
        });
      }
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message || "Kon RAG instelling niet updaten.",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">
            Documenten
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {documents.length} documenten{isReadOnly && " (Alleen bekijken)"}
          </p>
        </div>
        {canEdit && (
          <Button variant="hero" size="sm" className="w-full sm:w-auto flex-shrink-0" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            Uploaden
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4 sm:mb-6 w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Zoek documenten..."
          className="pl-10 w-full"
        />
      </div>

      {/* Upload Area - Only show if user can edit */}
      {canEdit && (
        <div
          className={`glass rounded-xl sm:rounded-2xl p-4 sm:p-8 mb-4 sm:mb-6 border-dashed border-2 transition-colors cursor-pointer w-full max-w-full ${
            isDragging ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/50"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.pdf,.docx,.xls,.xlsx"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
        <div className="flex flex-col items-center text-center">
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-primary/10 flex items-center justify-center mb-3 sm:mb-4">
            <Upload className="w-5 h-5 sm:w-7 sm:h-7 text-primary" />
          </div>
          <h3 className="font-display text-sm sm:text-base font-semibold text-foreground mb-1">
            Sleep bestanden hierheen
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">
            of klik om te bladeren
          </p>
          <p className="text-xs text-muted-foreground hidden sm:block">
            Toegestaan: Word (.docx), Notepad (.txt), Excel (.xls, .xlsx), PDF (.pdf) • Max. 20MB
          </p>
          <p className="text-xs text-muted-foreground sm:hidden">
            PDF, Word, Excel, TXT • Max. 20MB
          </p>
        </div>
        </div>
      )}

      {/* Documents List */}
      <div className="space-y-2 sm:space-y-3">
        {/* Show uploading files at the top - only if not already in documents list */}
        {uploadingFiles
          .filter((uploadingFile) => !filteredDocuments.some((doc) => doc.name === uploadingFile.name))
          .map((uploadingFile) => {
            const progress = uploadProgress[uploadingFile.name] || 0;
            return (
              <div
                key={`uploading-${uploadingFile.name}`}
                className="glass rounded-lg sm:rounded-xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 border-primary/30"
              >
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                  <Upload className="w-4 h-4 sm:w-5 sm:h-5 text-primary animate-pulse" />
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm sm:text-base text-foreground truncate">{uploadingFile.name}</h4>
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
                    <span>{uploadingFile.size}</span>
                    <span className="hidden sm:inline">•</span>
                    <span>Uploaden...</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  <CircularProgress value={progress} size={32} strokeWidth={3} />
                </div>
              </div>
            );
          })}

        {loading ? (
          <div className="glass rounded-xl p-6 sm:p-8 text-center">
            <p className="text-sm sm:text-base text-muted-foreground">Documenten laden...</p>
          </div>
        ) : filteredDocuments.length === 0 && uploadingFiles.length === 0 ? (
          <div className="glass rounded-xl p-6 sm:p-8 text-center">
            <FileText className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
            <p className="text-sm sm:text-base text-muted-foreground">Geen documenten gevonden</p>
          </div>
        ) : (
          filteredDocuments.map((doc) => {
            const IconComponent = typeIcons[doc.type];
            return (
              <div
                key={doc.id}
                className="glass rounded-lg sm:rounded-xl p-3 sm:p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                    <IconComponent className={`w-4 h-4 sm:w-5 sm:h-5 ${typeColors[doc.type]}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm sm:text-base text-foreground truncate mb-1">{doc.name}</h4>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-0">
                      <span>{doc.size}</span>
                      <span className="hidden sm:inline">•</span>
                      <span className="hidden sm:inline">{doc.uploadedAt}</span>
                      <span className="hidden sm:inline">•</span>
                      <span className="hidden sm:inline">{doc.uploadedBy}</span>
                      {/* Mobile: show only date and name on separate lines */}
                      <span className="sm:hidden block w-full text-xs mt-1">{doc.uploadedAt}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    {/* Show upload progress if uploading */}
                    {uploadProgress[doc.name] !== undefined && (
                      <CircularProgress value={uploadProgress[doc.name]} size={32} strokeWidth={3} />
                    )}
                    
                    {/* Show RAG processing indicator */}
                    {ragProcessingProgress[doc.id] && !uploadProgress[doc.name] && (
                      <div className="relative inline-flex items-center justify-center" style={{ width: 32, height: 32 }}>
                        <div className="absolute inset-0 border-2 border-blue-500/30 rounded-full" />
                        <div 
                          className="absolute inset-0 border-2 border-blue-500 rounded-full animate-spin"
                          style={{
                            borderTopColor: 'transparent',
                            borderRightColor: 'transparent',
                          }}
                        />
                        <FileText className="w-3 h-3 text-blue-500" />
                      </div>
                    )}
                    
                    {canEdit && (
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <Label htmlFor={`rag-${doc.id}`} className="text-xs sm:text-sm text-muted-foreground cursor-pointer">
                          <span className="hidden sm:inline">Verwerk document</span>
                          <span className="sm:hidden">Verwerk</span>
                        </Label>
                        <Switch
                          id={`rag-${doc.id}`}
                          checked={doc.use_for_rag}
                          onCheckedChange={(checked) => handleToggleRAG(doc, checked)}
                          disabled={!!uploadProgress[doc.name] || !!ragProcessingProgress[doc.id]}
                        />
                      </div>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 sm:p-2 hover:bg-secondary rounded-lg transition-colors">
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDownload(doc)}>
                          <Download className="w-4 h-4 mr-2" />
                          Downloaden
                        </DropdownMenuItem>
                        {canEdit && (
                          <DropdownMenuItem
                            onClick={() => handleDelete(doc)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Verwijderen
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Document verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je "{documentToDelete?.name}" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
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

export default DocumentsView;
