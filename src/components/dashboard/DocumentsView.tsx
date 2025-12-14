import { useState } from "react";
import { FileText, Upload, Search, MoreVertical, File, FileImage, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Document {
  id: string;
  name: string;
  type: "pdf" | "docx" | "xlsx" | "image";
  size: string;
  uploadedBy: string;
  uploadedAt: string;
}

const mockDocuments: Document[] = [
  {
    id: "1",
    name: "Installatiehandleiding Pomp Model X500",
    type: "pdf",
    size: "2.4 MB",
    uploadedBy: "Jan de Vries",
    uploadedAt: "2 dagen geleden",
  },
  {
    id: "2",
    name: "Technische Specificaties 2024",
    type: "pdf",
    size: "5.1 MB",
    uploadedBy: "Jan de Vries",
    uploadedAt: "1 week geleden",
  },
  {
    id: "3",
    name: "Onderhoudsschema Q1-Q4",
    type: "xlsx",
    size: "856 KB",
    uploadedBy: "Jan de Vries",
    uploadedAt: "2 weken geleden",
  },
  {
    id: "4",
    name: "Veiligheidsprotocollen",
    type: "docx",
    size: "1.2 MB",
    uploadedBy: "Jan de Vries",
    uploadedAt: "1 maand geleden",
  },
  {
    id: "5",
    name: "Schema Elektrische Aansluiting",
    type: "image",
    size: "3.8 MB",
    uploadedBy: "Jan de Vries",
    uploadedAt: "1 maand geleden",
  },
];

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

const DocumentsView = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredDocuments = mockDocuments.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Documenten
          </h1>
          <p className="text-muted-foreground">
            {mockDocuments.length} documenten in jouw organisatie
          </p>
        </div>
        <Button variant="hero">
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
      <div className="glass rounded-2xl p-8 mb-6 border-dashed border-2 border-border/50 hover:border-primary/50 transition-colors cursor-pointer">
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
            PDF, DOCX, XLSX, PNG, JPG (max. 50MB)
          </p>
        </div>
      </div>

      {/* Documents List */}
      <div className="space-y-3">
        {filteredDocuments.map((doc) => {
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
                </div>
              </div>

              <button className="p-2 hover:bg-secondary rounded-lg transition-colors">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DocumentsView;
