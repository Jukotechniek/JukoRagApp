import { useState, useRef, useCallback, useEffect } from "react";
import { FileText, Upload, Search, MoreVertical, File, FileImage, FileSpreadsheet, Trash2, Download, X } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { processDocumentForRAG, extractTextFromFile } from "@/lib/document-processing";
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

  // Use selected organization ID or fall back to user's organization
  const effectiveOrgId = selectedOrganizationId || user?.organization_id || null;

  // Load documents
  useEffect(() => {
    if (effectiveOrgId) {
      loadDocuments();
    }
  }, [effectiveOrgId]);

  const loadDocuments = async () => {
    if (!effectiveOrgId) return;

    try {
      setLoading(true);
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

      if (error) throw error;

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
          };
        });
        setDocuments(formattedDocs);
      }
    } catch (error) {
      toast({
        title: "Fout",
        description: "Kon documenten niet laden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !effectiveOrgId || !user) return;

    for (const file of Array.from(files)) {
      // Validate file is not empty
      if (file.size === 0) {
        toast({
          title: "Leeg bestand",
          description: `${file.name} is leeg. Upload alleen bestanden met inhoud.`,
          variant: "destructive",
        });
        continue;
      }

      // Validate file type
      const validTypes = [
        "text/plain", // .txt files
        "text/markdown", // .md files
        "text/csv", // .csv files
        "application/json", // .json files
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      ];
      
      // Also check file extension as fallback (some browsers don't set MIME type correctly)
      const fileExt = file.name.split(".").pop()?.toLowerCase();
      const validExtensions = ["txt", "md", "csv", "json", "pdf", "docx", "xlsx"];
      
      if (!validTypes.includes(file.type) && !validExtensions.includes(fileExt || "")) {
        toast({
          title: "Ongeldig bestandstype",
          description: `${file.name} heeft een ongeldig type. Toegestaan: TXT, MD, CSV, JSON, PDF, DOCX, XLSX.`,
          variant: "destructive",
        });
        continue;
      }

      // Validate file size (50MB max)
      if (file.size > 50 * 1024 * 1024) {
        toast({
          title: "Bestand te groot",
          description: `${file.name} is te groot. Maximum grootte is 50MB.`,
          variant: "destructive",
        });
        continue;
      }

      // For text-based files, check if they have meaningful content (not just whitespace)
      const textBasedTypes = ["text/plain", "text/markdown", "text/csv", "application/json"];
      const textBasedExtensions = ["txt", "md", "csv", "json"];
      
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
        });
        continue;
      }

      try {
        // Upload to Supabase Storage
        const fileExt = file.name.split(".").pop();
        const fileName = `${effectiveOrgId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Construct storage URL without /public/ (direct storage access)
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const storageUrl = `${supabaseUrl}/storage/v1/object/documents/${encodeURIComponent(fileName)}`;

        // Save document metadata to database
        const { data: savedDocument, error: dbError } = await (supabase
          .from("documents") as any)
          .insert({
            organization_id: effectiveOrgId,
            name: file.name,
            file_type: file.type,
            file_size: file.size,
            file_url: storageUrl,
            uploaded_by: user.id,
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

        toast({
          title: "Document geüpload",
          description: `${file.name} is succesvol geüpload. Verwerking voor RAG wordt gestart...`,
        });

        // Process document for RAG (chunking + embeddings) in background
        // N8N will fetch the file from Supabase Storage and extract text itself
        if (savedDocument) {
          try {
            // Show processing toast
            toast({
              title: "Document wordt verwerkt...",
              description: `${file.name} wordt verwerkt voor RAG.`,
            });
            
            // Process in background - only send documentId and organizationId
            // N8N will handle file download and text extraction
            processDocumentForRAG((savedDocument as any).id, effectiveOrgId)
                .then(() => {
                console.log(`Document processed successfully: ${file.name}`);
                  toast({
                  title: "✅ Document verwerkt",
                  description: `${file.name} is verwerkt en klaar voor gebruik in de chat.`,
                  });
                })
                .catch((error) => {
                console.error(`Document processing failed for ${file.name}:`, error);
                  toast({
                  title: "❌ Verwerking mislukt",
                  description: `${error.message || 'Onbekende fout tijdens RAG verwerking.'}`,
                    variant: "destructive",
                });
              });
          } catch (error: any) {
            console.error(`Failed to start processing for ${file.name}:`, error);
            toast({
              title: "❌ Verwerking mislukt",
              description: error.message || 'Onbekende fout bij starten van verwerking.',
              variant: "destructive",
            });
          }
        }

        // Reload documents
        await loadDocuments();
      } catch (error: any) {
        toast({
          title: "Upload mislukt",
          description: error.message || "Er is een fout opgetreden bij het uploaden.",
          variant: "destructive",
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
    setDocumentToDelete(doc);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!documentToDelete || !effectiveOrgId) return;

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
        const fileName = documentToDelete.file_url.split("/").pop();
        if (fileName) {
          await supabase.storage
            .from("documents")
            .remove([`${effectiveOrgId}/${fileName}`]);
        }
      }

      toast({
        title: "Document verwijderd",
        description: `${documentToDelete.name} is verwijderd.`,
      });

      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
      await loadDocuments();
    } catch (error: any) {
      toast({
        title: "Verwijderen mislukt",
        description: error.message || "Er is een fout opgetreden.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (doc: Document) => {
    if (!doc.file_url) {
      toast({
        title: "Geen downloadlink",
        description: "Er is geen bestand gekoppeld aan dit document.",
        variant: "destructive",
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
      });
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Documenten
          </h1>
          <p className="text-muted-foreground">
            {documents.length} documenten in jouw organisatie
          </p>
        </div>
        <Button variant="hero" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-4 h-4 mr-2" />
          Document Uploaden
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Zoek documenten..."
          className="pl-10"
        />
      </div>

      {/* Upload Area */}
      <div
        className={`glass rounded-2xl p-8 mb-6 border-dashed border-2 transition-colors cursor-pointer ${
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
          accept=".txt,.md,.csv,.json,.pdf,.docx,.xlsx"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Upload className="w-7 h-7 text-primary" />
          </div>
          <h3 className="font-display font-semibold text-foreground mb-1">
            Sleep bestanden hierheen
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            of klik om te bladeren
          </p>
          <p className="text-xs text-muted-foreground">
            Verwerkbaar: PDF, XLSX, TXT, MD, CSV, JSON • Ook toegestaan: DOCX (max. 50MB)
          </p>
        </div>
      </div>

      {/* Documents List */}
      <div className="space-y-3">
        {loading ? (
          <div className="glass rounded-xl p-8 text-center">
            <p className="text-muted-foreground">Documenten laden...</p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="glass rounded-xl p-8 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Geen documenten gevonden</p>
          </div>
        ) : (
          filteredDocuments.map((doc) => {
            const IconComponent = typeIcons[doc.type];
            return (
              <div
                key={doc.id}
                className="glass rounded-xl p-4 flex items-center gap-4 hover:border-primary/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                  <IconComponent className={`w-5 h-5 ${typeColors[doc.type]}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-foreground truncate">{doc.name}</h4>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{doc.size}</span>
                    <span>•</span>
                    <span>{doc.uploadedAt}</span>
                    <span>•</span>
                    <span>{doc.uploadedBy}</span>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-2 hover:bg-secondary rounded-lg transition-colors">
                      <MoreVertical className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleDownload(doc)}>
                      <Download className="w-4 h-4 mr-2" />
                      Downloaden
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(doc)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Verwijderen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
