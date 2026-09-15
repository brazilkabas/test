"use client";
/* eslint-disable @next/next/no-img-element -- authenticated brand assets and curated data-URI marks */

import { Archive, Search, Star, Upload, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "@/components/api";
import { Drawer, useToast } from "@/components/design-system";

export type BrandAsset = {
  id: string; name: string; contentType: string; size: number; category: string; variant: string;
  tags: string[]; favorite: boolean; isDefault: boolean; archivedAt: string | null;
  lastUsedAt: string | null; createdAt: string; updatedAt: string; url: string;
};
export type LogoChoice = { kind: "custom"; asset: BrandAsset };

const categories = ["All", "Company Logos", "Custom Uploads", "Recent", "Favorites"] as const;
type Sort = "Recommended" | "Provider" | "A-Z" | "Z-A" | "Recently Used" | "Recently Added" | "Favorites" | "Custom First";

export function LogoLibrary({ open, assets, onAssetsChange, onClose, onSelect }: {
  open: boolean;
  assets: BrandAsset[];
  onAssetsChange: (assets: BrandAsset[]) => void;
  onClose: () => void;
  onSelect: (choice: LogoChoice) => void;
}) {
  const { notify } = useToast();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [sort, setSort] = useState<Sort>("Recommended");

  const choices = useMemo(() => {
    const all: LogoChoice[] = assets.filter((asset) => !asset.archivedAt).map((asset): LogoChoice => ({ kind: "custom", asset }));
    const searched = all.filter((choice) => {
      const value = `${choice.asset.name} ${choice.asset.category} ${choice.asset.variant} ${choice.asset.tags.join(" ")}`;
      if (query && !value.toLowerCase().includes(query.toLowerCase())) return false;
      if (category === "All") return true;
      if (category === "Custom Uploads") return true;
      if (category === "Recent") return Boolean(choice.asset.lastUsedAt);
      if (category === "Favorites") return choice.asset.favorite;
      return choice.asset.category === category;
    });
    return searched.sort((a, b) => compareChoices(a, b, sort));
  }, [assets, category, query, sort]);

  async function select(choice: LogoChoice) {
    void api(`/brand-assets/${choice.asset.id}`, { method: "PATCH", body: JSON.stringify({ markUsed: true }) });
    onAssetsChange(assets.map((asset) => asset.id === choice.asset.id ? { ...asset, lastUsedAt: new Date().toISOString() } : asset));
    onSelect(choice); onClose();
  }
  async function toggleFavorite(choice: LogoChoice) {
    const result = await api<{ asset: BrandAsset }>(`/brand-assets/${choice.asset.id}`, { method: "PATCH", body: JSON.stringify({ favorite: !choice.asset.favorite }) });
    onAssetsChange(assets.map((asset) => asset.id === result.asset.id ? result.asset : asset));
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return;
    try {
      const result = await api<{ asset: BrandAsset }>("/brand-assets", { method: "POST", body: JSON.stringify({
        name: data.get("name") || file.name, contentType: file.type, contentBytes: await fileBase64(file),
        category: "Company Logos", variant: data.get("variant"), tags: String(data.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
      }) });
      onAssetsChange([result.asset, ...assets.filter((asset) => asset.id !== result.asset.id)]);
      form.reset();
      notify({ title: "Logo added to company library", tone: "success" });
      onSelect({ kind: "custom", asset: result.asset }); onClose();
    } catch (error) { notify({ title: "Logo upload failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }

  return <Drawer open={open} title="Choose company logo" onClose={onClose}>
    <div className="logo-library">
      <div className="logo-library-toolbar"><label><Search size={14} /><input autoFocus placeholder="Search logos…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Sort logos" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>{["Recommended", "Provider", "A-Z", "Z-A", "Recently Used", "Recently Added", "Favorites", "Custom First"].map((value) => <option key={value}>{value}</option>)}</select></div>
      <div className="logo-categories">{categories.map((value) => <button className={category === value ? "active" : ""} onClick={() => setCategory(value)} key={value}>{value}</button>)}</div>
      <div className="logo-tile-grid">{choices.map((choice) => {
        const name = choice.asset.name;
        return <article className="logo-tile" key={choice.asset.id}><button className="logo-select" onClick={() => void select(choice)}><span><img src={choice.asset.url} alt="" /></span><strong>{name}</strong><small>{choice.asset.variant} · Company</small></button><button className={`logo-favorite ${choice.asset.favorite ? "active" : ""}`} onClick={() => void toggleFavorite(choice)} aria-label={`${choice.asset.favorite ? "Remove" : "Add"} ${name} ${choice.asset.favorite ? "from" : "to"} favorites`}><Star size={14} fill={choice.asset.favorite ? "currentColor" : "none"} /></button></article>;
      })}</div>
      {choices.length === 0 && <div className="compact-empty">No logos match this search.</div>}
      <details className="logo-upload"><summary><Upload size={14} />Upload company logo</summary><form onSubmit={upload}><label>Name<input name="name" placeholder="Main Company Logo" /></label><label>Variant<select name="variant"><option>Full Color</option><option>Light</option><option>Dark</option><option>Monochrome</option><option>Icon</option><option>Wordmark</option></select></label><label>Tags<input name="tags" placeholder="company, department, wordmark" /></label><label>File<input name="file" type="file" accept=".png,.jpg,.jpeg,.webp,.svg" required /></label><button><Upload size={14} />Upload and save</button></form></details>
    </div>
  </Drawer>;
}

export function BrandAssetManager({ initialAssets = [] }: { initialAssets?: BrandAsset[] }) {
  const { notify } = useToast();
  const [assets, setAssets] = useState(initialAssets);
  const [libraryOpen, setLibraryOpen] = useState(false);
  useEffect(() => { void api<{ assets: BrandAsset[] }>("/brand-assets?archived=true").then((result) => setAssets(result.assets)).catch(() => undefined); }, []);
  async function update(asset: BrandAsset, patch: Record<string, unknown>) {
    try {
      const result = await api<{ asset: BrandAsset }>(`/brand-assets/${asset.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setAssets((items) => items.map((item) => item.id === result.asset.id ? result.asset : item));
    } catch (error) { notify({ title: "Brand asset update failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }
  async function remove(asset: BrandAsset) {
    if (!confirm(`Permanently delete ${asset.name}?`)) return;
    await api(`/brand-assets/${asset.id}`, { method: "DELETE" });
    setAssets((items) => items.filter((item) => item.id !== asset.id));
  }
  return <div className="stack"><div className="page-header"><div><div className="eyebrow">Settings · Brand Assets</div><h1>Company logo library</h1><p className="muted">Maintain reusable approved company marks for every page project.</p></div><button onClick={() => setLibraryOpen(true)}><Upload size={15} />Add logo</button></div><section className="panel"><div className="brand-manager-grid">{assets.map((asset) => <article className={asset.archivedAt ? "is-archived" : ""} key={asset.id}><div className="brand-manager-preview"><img src={asset.url} alt={asset.name} /></div><input aria-label="Logo name" value={asset.name} onChange={(event) => setAssets((items) => items.map((item) => item.id === asset.id ? { ...item, name: event.target.value } : item))} onBlur={() => void update(asset, { name: asset.name })} /><select value={asset.variant} onChange={(event) => void update(asset, { variant: event.target.value })}>{["Full Color", "Light", "Dark", "Monochrome", "Icon", "Wordmark"].map((variant) => <option key={variant}>{variant}</option>)}</select><input aria-label={`${asset.name} tags`} placeholder="Tags, comma separated" value={asset.tags.join(", ")} onChange={(event) => setAssets((items) => items.map((item) => item.id === asset.id ? { ...item, tags: event.target.value.split(",").map((tag) => tag.trim()) } : item))} onBlur={() => void update(asset, { tags: asset.tags.filter(Boolean) })} /><div className="row"><button className="secondary button-sm" onClick={() => void update(asset, { favorite: !asset.favorite })}><Star size={13} />{asset.favorite ? "Favorited" : "Favorite"}</button><button className="secondary button-sm" onClick={() => void update(asset, { isDefault: true })}>{asset.isDefault ? "Default" : "Set default"}</button><button className="secondary button-sm" onClick={() => void update(asset, { archived: !asset.archivedAt })}>{asset.archivedAt ? <X size={13} /> : <Archive size={13} />}{asset.archivedAt ? "Restore" : "Archive"}</button><button className="danger-button button-sm" onClick={() => void remove(asset)}>Delete</button></div></article>)}</div>{assets.length === 0 && <div className="compact-empty">Upload the first approved company logo.</div>}</section><LogoLibrary open={libraryOpen} assets={assets} onAssetsChange={setAssets} onClose={() => setLibraryOpen(false)} onSelect={() => undefined} /></div>;
}

function compareChoices(a: LogoChoice, b: LogoChoice, sort: Sort) {
  const name = (choice: LogoChoice) => choice.asset.name;
  const favored = (choice: LogoChoice) => choice.asset.favorite;
  const used = (choice: LogoChoice) => choice.asset.lastUsedAt ? -new Date(choice.asset.lastUsedAt).getTime() : Number.MAX_SAFE_INTEGER;
  if (sort === "A-Z") return name(a).localeCompare(name(b));
  if (sort === "Z-A") return name(b).localeCompare(name(a));
  if (sort === "Provider") return name(a).localeCompare(name(b));
  if (sort === "Favorites") return Number(favored(b)) - Number(favored(a)) || name(a).localeCompare(name(b));
  if (sort === "Custom First") return name(a).localeCompare(name(b));
  if (sort === "Recently Used") return used(a) - used(b);
  if (sort === "Recently Added") return new Date(b.asset.createdAt).getTime() - new Date(a.asset.createdAt).getTime();
  return Number(favored(b)) - Number(favored(a)) || name(a).localeCompare(name(b));
}
function fileBase64(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
