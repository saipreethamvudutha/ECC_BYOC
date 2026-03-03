"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Target,
  Plus,
  Globe,
  Users,
  Server,
  Pencil,
  Trash2,
  X,
  ChevronDown,
  Loader2,
  AlertTriangle,
  Search,
  Tag,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TagFilter {
  [key: string]: string[];
}

interface ScopeItem {
  id: string;
  name: string;
  description: string | null;
  tagFilter: TagFilter;
  isGlobal: boolean;
  userCount: number;
  createdBy: string;
  createdAt: string;
}

interface TagItem {
  id: string;
  key: string;
  value: string;
  color: string | null;
  assetCount: number;
  createdAt: string;
}

interface PreviewResult {
  count: number;
  assets: { id: string; name: string; type: string }[];
}

// ---------------------------------------------------------------------------
// Tag color helpers
// ---------------------------------------------------------------------------

const TAG_KEY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  environment: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
  region: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
  team: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30" },
  department: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  classification: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
  tier: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/30" },
  owner: { bg: "bg-pink-500/10", text: "text-pink-400", border: "border-pink-500/30" },
};

function getTagColor(key: string) {
  return TAG_KEY_COLORS[key.toLowerCase()] ?? {
    bg: "bg-slate-500/10",
    text: "text-slate-400",
    border: "border-slate-500/30",
  };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ScopesPage() {
  const [scopes, setScopes] = useState<ScopeItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tagsLoading, setTagsLoading] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingScope, setEditingScope] = useState<ScopeItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingScope, setDeletingScope] = useState<ScopeItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTagFilter, setFormTagFilter] = useState<TagFilter>({});
  const [formIsGlobal, setFormIsGlobal] = useState(false);

  // Tag filter builder state
  const [selectedTagKey, setSelectedTagKey] = useState<string>("");
  const [tagKeyDropdownOpen, setTagKeyDropdownOpen] = useState(false);

  // Preview state
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchScopes = useCallback(async () => {
    try {
      const res = await fetch("/api/scopes");
      if (res.ok) {
        const data = await res.json();
        setScopes(data);
      }
    } catch (err) {
      console.error("Failed to fetch scopes:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    setTagsLoading(true);
    try {
      const res = await fetch("/api/tags");
      if (res.ok) {
        const data = await res.json();
        setTags(data);
      }
    } catch (err) {
      console.error("Failed to fetch tags:", err);
    } finally {
      setTagsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScopes();
  }, [fetchScopes]);

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const tagsByKey = tags.reduce<Record<string, TagItem[]>>((acc, tag) => {
    if (!acc[tag.key]) acc[tag.key] = [];
    acc[tag.key].push(tag);
    return acc;
  }, {});

  const tagKeys = Object.keys(tagsByKey).sort();

  const globalScopes = scopes.filter((s) => s.isGlobal);
  const usersWithScopes = new Set(scopes.flatMap(() => [])).size || scopes.reduce((sum, s) => sum + s.userCount, 0);

  const filteredScopes = scopes.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
  });

  // -------------------------------------------------------------------------
  // Preview
  // -------------------------------------------------------------------------

  const fetchPreview = useCallback(
    async (tagFilter: TagFilter, scopeId?: string) => {
      // Only preview if there are actual filters
      const hasFilters = Object.values(tagFilter).some((v) => v.length > 0);
      if (!hasFilters) {
        setPreviewResult(null);
        return;
      }

      setPreviewLoading(true);
      try {
        if (scopeId) {
          const res = await fetch(`/api/scopes/${scopeId}/preview`);
          if (res.ok) {
            const data = await res.json();
            setPreviewResult(data);
          }
        } else {
          // For new scopes, simulate by posting the filter
          const res = await fetch("/api/scopes/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagFilter }),
          });
          if (res.ok) {
            const data = await res.json();
            setPreviewResult(data);
          }
        }
      } catch (err) {
        console.error("Failed to fetch preview:", err);
      } finally {
        setPreviewLoading(false);
      }
    },
    []
  );

  // Debounced preview on tag filter changes
  useEffect(() => {
    if (!dialogOpen) return;
    const timer = setTimeout(() => {
      fetchPreview(formTagFilter, editingScope?.id);
    }, 500);
    return () => clearTimeout(timer);
  }, [formTagFilter, dialogOpen, editingScope?.id, fetchPreview]);

  // -------------------------------------------------------------------------
  // Dialog handlers
  // -------------------------------------------------------------------------

  function openCreateDialog() {
    setEditingScope(null);
    setFormName("");
    setFormDescription("");
    setFormTagFilter({});
    setFormIsGlobal(false);
    setSelectedTagKey("");
    setPreviewResult(null);
    setDialogOpen(true);
    fetchTags();
  }

  function openEditDialog(scope: ScopeItem) {
    setEditingScope(scope);
    setFormName(scope.name);
    setFormDescription(scope.description || "");
    setFormTagFilter({ ...scope.tagFilter });
    setFormIsGlobal(scope.isGlobal);
    setSelectedTagKey("");
    setPreviewResult(null);
    setDialogOpen(true);
    fetchTags();
  }

  function openDeleteDialog(scope: ScopeItem) {
    setDeletingScope(scope);
    setDeleteDialogOpen(true);
  }

  // -------------------------------------------------------------------------
  // Tag filter builder
  // -------------------------------------------------------------------------

  function toggleTagValue(key: string, value: string) {
    setFormTagFilter((prev) => {
      const current = prev[key] || [];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];

      const next = { ...prev };
      if (updated.length === 0) {
        delete next[key];
      } else {
        next[key] = updated;
      }
      return next;
    });
  }

  function removeTagFilter(key: string, value: string) {
    setFormTagFilter((prev) => {
      const current = prev[key] || [];
      const updated = current.filter((v) => v !== value);
      const next = { ...prev };
      if (updated.length === 0) {
        delete next[key];
      } else {
        next[key] = updated;
      }
      return next;
    });
  }

  function clearAllFilters() {
    setFormTagFilter({});
  }

  // -------------------------------------------------------------------------
  // CRUD operations
  // -------------------------------------------------------------------------

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);

    try {
      const body = {
        name: formName.trim(),
        description: formDescription.trim() || null,
        tagFilter: formTagFilter,
        isGlobal: formIsGlobal,
      };

      let res: Response;
      if (editingScope) {
        res = await fetch(`/api/scopes/${editingScope.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: body.name,
            description: body.description,
            tagFilter: body.tagFilter,
          }),
        });
      } else {
        res = await fetch("/api/scopes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (res.ok) {
        setDialogOpen(false);
        fetchScopes();
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Failed to save scope:", err);
      }
    } catch (err) {
      console.error("Failed to save scope:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingScope) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/scopes/${deletingScope.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteDialogOpen(false);
        setDeletingScope(null);
        fetchScopes();
      }
    } catch (err) {
      console.error("Failed to delete scope:", err);
    } finally {
      setDeleting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render: loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading scopes...</p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: tag filter pills (shared between scope cards and dialog)
  // -------------------------------------------------------------------------

  function renderTagFilterPills(
    tagFilter: TagFilter,
    removable = false,
    onRemove?: (key: string, value: string) => void
  ) {
    const entries = Object.entries(tagFilter);
    if (entries.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([key, values]) =>
          values.map((value) => {
            const colors = getTagColor(key);
            return (
              <span
                key={`${key}:${value}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  colors.bg,
                  colors.text,
                  colors.border
                )}
              >
                {key}:{value}
                {removable && onRemove && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(key, value);
                    }}
                    className="ml-0.5 hover:opacity-70 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            );
          })
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            label: "Total Scopes",
            value: scopes.length,
            icon: Target,
            color: "text-cyan-400",
          },
          {
            label: "Global Scopes",
            value: globalScopes.length,
            icon: Globe,
            color: "text-blue-400",
          },
          {
            label: "Users With Scopes",
            value: usersWithScopes,
            icon: Users,
            color: "text-emerald-400",
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-4">
              <div
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                  stat.color === "text-cyan-400" && "bg-cyan-500/10",
                  stat.color === "text-blue-400" && "bg-blue-500/10",
                  stat.color === "text-emerald-400" && "bg-emerald-500/10"
                )}
              >
                <stat.icon className={cn("w-5 h-5", stat.color)} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-slate-400">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search scopes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Create Scope
        </Button>
      </div>

      {/* Scope Cards */}
      <div className="space-y-3">
        {filteredScopes.length === 0 && !loading && (
          <Card>
            <CardContent className="py-16">
              <div className="text-center text-slate-500">
                <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">
                  {searchQuery
                    ? "No scopes match your search."
                    : "No scopes created yet."}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  {searchQuery
                    ? "Try a different search term."
                    : "Create scopes to define tag-based data boundaries for users."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {filteredScopes.map((scope) => {
          const filterEntries = Object.entries(scope.tagFilter || {});
          const totalFilterTags = filterEntries.reduce(
            (sum, [, vals]) => sum + vals.length,
            0
          );

          return (
            <Card
              key={scope.id}
              className="hover:border-slate-700 transition-all"
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div
                    className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                      scope.isGlobal ? "bg-blue-500/10" : "bg-cyan-500/10"
                    )}
                  >
                    {scope.isGlobal ? (
                      <Globe className="w-5 h-5 text-blue-400" />
                    ) : (
                      <Target className="w-5 h-5 text-cyan-400" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-white">
                        {scope.name}
                      </span>
                      {scope.isGlobal && (
                        <Badge variant="info">
                          <Globe className="w-3 h-3 mr-1" />
                          Global
                        </Badge>
                      )}
                    </div>

                    {scope.description && (
                      <p className="text-xs text-slate-400 mb-2">
                        {scope.description}
                      </p>
                    )}

                    {/* Tag filter pills */}
                    {totalFilterTags > 0 && (
                      <div className="mb-2">
                        {renderTagFilterPills(scope.tagFilter)}
                      </div>
                    )}

                    {/* Meta info */}
                    <div className="flex items-center gap-4 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {scope.userCount} user{scope.userCount !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {totalFilterTags} tag filter
                        {totalFilterTags !== 1 ? "s" : ""}
                      </span>
                      <span>
                        Created by {scope.createdBy} on{" "}
                        {formatDateTime(scope.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(scope)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDeleteDialog(scope)}
                      disabled={scope.isGlobal}
                      className={cn(
                        scope.isGlobal && "opacity-30 cursor-not-allowed"
                      )}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Create / Edit Dialog                                               */}
      {/* ----------------------------------------------------------------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingScope ? "Edit Scope" : "Create Scope"}
            </DialogTitle>
            <DialogDescription>
              {editingScope
                ? "Update this scope's name, description, and tag filters."
                : "Define a new scope with tag-based filters to control data visibility."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">
                Name <span className="text-red-400">*</span>
              </label>
              <Input
                placeholder="e.g., Production US-East"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">
                Description
              </label>
              <textarea
                placeholder="Describe what this scope provides access to..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
                className="flex w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-200 resize-none"
              />
            </div>

            {/* Tag Filter Builder */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">
                  Tag Filters
                </label>
                {Object.keys(formTagFilter).length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* Current filter pills */}
              {Object.keys(formTagFilter).length > 0 && (
                <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50">
                  {renderTagFilterPills(formTagFilter, true, removeTagFilter)}
                </div>
              )}

              {/* Tag key selector */}
              {tagsLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-3">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading tags...
                </div>
              ) : tagKeys.length === 0 ? (
                <div className="text-center py-4 text-slate-500">
                  <Tag className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">No tags available.</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    Tags must be created before they can be used in scopes.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Key dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setTagKeyDropdownOpen(!tagKeyDropdownOpen)}
                      className="flex items-center justify-between w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white hover:border-slate-600 transition-all"
                    >
                      <span
                        className={
                          selectedTagKey ? "text-white" : "text-slate-500"
                        }
                      >
                        {selectedTagKey || "Select a tag key..."}
                      </span>
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 text-slate-400 transition-transform",
                          tagKeyDropdownOpen && "rotate-180"
                        )}
                      />
                    </button>

                    {tagKeyDropdownOpen && (
                      <div className="absolute z-10 w-full mt-1 rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
                        {tagKeys.map((key) => {
                          const colors = getTagColor(key);
                          return (
                            <button
                              type="button"
                              key={key}
                              onClick={() => {
                                setSelectedTagKey(key);
                                setTagKeyDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-2 text-sm hover:bg-slate-800 transition-colors flex items-center gap-2",
                                selectedTagKey === key
                                  ? "bg-slate-800 text-cyan-400"
                                  : "text-slate-300"
                              )}
                            >
                              <span
                                className={cn(
                                  "w-2 h-2 rounded-full flex-shrink-0",
                                  colors.bg,
                                  colors.border,
                                  "border"
                                )}
                              />
                              {key}
                              <span className="text-xs text-slate-500 ml-auto">
                                {tagsByKey[key].length} value
                                {tagsByKey[key].length !== 1 ? "s" : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Value checkboxes */}
                  {selectedTagKey && tagsByKey[selectedTagKey] && (
                    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
                      <p className="text-xs font-medium text-slate-400 mb-2">
                        Select values for{" "}
                        <span className="text-white">{selectedTagKey}</span>
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {tagsByKey[selectedTagKey].map((tag) => {
                          const isSelected = (
                            formTagFilter[selectedTagKey] || []
                          ).includes(tag.value);
                          return (
                            <label
                              key={tag.id}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm",
                                isSelected
                                  ? "border-cyan-500/40 bg-cyan-500/5 text-white"
                                  : "border-slate-700/50 bg-slate-800/20 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() =>
                                  toggleTagValue(selectedTagKey, tag.value)
                                }
                                className="sr-only"
                              />
                              <div
                                className={cn(
                                  "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all",
                                  isSelected
                                    ? "border-cyan-400 bg-cyan-500"
                                    : "border-slate-600"
                                )}
                              >
                                {isSelected && (
                                  <svg
                                    className="w-2.5 h-2.5 text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={3}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </div>
                              <span className="flex-1 truncate">
                                {tag.value}
                              </span>
                              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                <Server className="w-2.5 h-2.5" />
                                {tag.assetCount}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Live Preview */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Server className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-slate-300">
                  Asset Match Preview
                </span>
              </div>
              {previewLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Calculating matches...
                </div>
              ) : previewResult ? (
                <div>
                  <p className="text-2xl font-bold text-white">
                    {previewResult.count}
                  </p>
                  <p className="text-xs text-slate-400">
                    asset{previewResult.count !== 1 ? "s" : ""} match this scope
                  </p>
                  {previewResult.assets.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {previewResult.assets.slice(0, 5).map((asset) => (
                        <div
                          key={asset.id}
                          className="flex items-center gap-2 text-xs text-slate-400"
                        >
                          <Server className="w-3 h-3 text-slate-500" />
                          <span className="text-slate-300">{asset.name}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {asset.type}
                          </Badge>
                        </div>
                      ))}
                      {previewResult.count > 5 && (
                        <p className="text-[10px] text-slate-500 mt-1">
                          and {previewResult.count - 5} more...
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  {Object.keys(formTagFilter).length === 0
                    ? "Add tag filters above to see matching assets."
                    : "No matching assets found."}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim()}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingScope ? "Update Scope" : "Create Scope"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------------- */}
      {/* Delete Confirmation Dialog                                         */}
      {/* ----------------------------------------------------------------- */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Delete Scope
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the scope{" "}
              <span className="text-white font-medium">
                {deletingScope?.name}
              </span>
              ? This action cannot be undone. Users currently assigned this
              scope will lose their scoped access.
            </DialogDescription>
          </DialogHeader>

          {deletingScope?.isGlobal && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-400">
              <Globe className="w-4 h-4 flex-shrink-0" />
              Global scopes cannot be deleted.
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || !!deletingScope?.isGlobal}
            >
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete Scope
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
