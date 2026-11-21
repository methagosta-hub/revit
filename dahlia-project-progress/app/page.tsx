"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity, AlertCircle, ArrowDownRight, ArrowUpRight, BarChart3, BriefcaseBusiness,
  CalendarDays, CheckCircle2, ChevronDown, CircleDollarSign, ClipboardList, FilePlus2,
  FolderKanban, LogOut, Plus, RefreshCw, Save, Settings2, ShieldCheck, TrendingUp,
  WalletCards, X, Pencil, Trash2, GitBranchPlus, Printer,
} from "lucide-react";
import { getProgressSupabase } from "@/lib/supabase";
import { buildCurvePoints, calculateWeights, itemAmount, itemPlannedPercent, plannedProgress, reportProgress } from "@/lib/curve";
import { dateLabel, localDateKey, money, number } from "@/lib/formatters";
import type { BoqItem, CurvePoint, Project, Report, ReportItem } from "@/lib/types";

type View = "dashboard" | "projects" | "rab" | "progress" | "reports";
type ItemDraft = {
  id?: string;
  item_code: string;
  work_group: string;
  description: string;
  unit: string;
  quantity: string;
  unit_price: string;
  planned_start_date: string;
  planned_end_date: string;
};
type ProjectDraft = {
  name: string; client_name: string; location: string; contract_number: string; start_date: string; end_date: string;
};

const emptyProject: ProjectDraft = {
  name: "", client_name: "", location: "", contract_number: "",
  start_date: localDateKey(new Date()), end_date: localDateKey(new Date(new Date().setMonth(new Date().getMonth() + 6))),
};
const emptyItem: ItemDraft = {
  item_code: "", work_group: "Pekerjaan Persiapan", description: "", unit: "ls",
  quantity: "1", unit_price: "0", planned_start_date: "", planned_end_date: "",
};

function formatWeight(value: number) {
  return `${number(value, 3)}%`;
}

function CurveChart({ points }: { points: CurvePoint[] }) {
  if (!points.length) return <div className="chart-empty">Belum ada data untuk membentuk grafik.</div>;
  const width = 760, height = 270, left = 44, right = 15, top = 13, bottom = 37;
  const innerW = width - left - right, innerH = height - top - bottom;
  const first = new Date(points[0].date + "T00:00:00").getTime();
  const last = new Date(points[points.length - 1].date + "T00:00:00").getTime();
  const span = Math.max(1, last - first);
  const x = (date: string) => left + (new Date(date + "T00:00:00").getTime() - first) / span * innerW;
  const y = (value: number) => top + (100 - Math.max(0, Math.min(100, value))) / 100 * innerH;
  const planPath = points.map((point, index) => `${index ? "L" : "M"} ${x(point.date).toFixed(1)} ${y(point.planned).toFixed(1)}`).join(" ");
  const actualPoints = points.filter((point) => point.actual !== null);
  const actualPath = actualPoints.map((point, index) => `${index ? "L" : "M"} ${x(point.date).toFixed(1)} ${y(point.actual || 0).toFixed(1)}`).join(" ");
  const labelDates = [points[0].date, points[Math.floor((points.length - 1) / 2)].date, points[points.length - 1].date];
  return (
    <div className="chart-wrap">
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafik Kurva S rencana dan realisasi">
        {[0,25,50,75,100].map((value) => <g key={value}>
          <line className="chart-gridline" x1={left} x2={width-right} y1={y(value)} y2={y(value)}/>
          <text className="chart-axis" x={left-9} y={y(value)+3} textAnchor="end">{value}%</text>
        </g>)}
        <path className="chart-plan" d={planPath}/>
        {actualPath && <path className="chart-actual" d={actualPath}/>}
        {actualPoints.map((point) => <circle key={point.date} cx={x(point.date)} cy={y(point.actual || 0)} r="4" fill="#13a08e" stroke="#fff" strokeWidth="2">
          <title>{dateLabel(point.date)} · Aktual {number(point.actual || 0,2)}%</title>
        </circle>)}
        {labelDates.map((date,index) => <text key={`${date}-${index}`} className="chart-axis" x={x(date)} y={height-10} textAnchor={index===0?"start":index===2?"end":"middle"}>{dateLabel(date,{day:"2-digit",month:"short"})}</text>)}
      </svg>
      <div className="legend"><span><i style={{background:"#3978c5"}}/> Rencana berbobot</span><span><i style={{background:"#13a08e"}}/> Realisasi kumulatif</span></div>
    </div>
  );
}

function LoginPanel({ supabase }: { supabase: NonNullable<ReturnType<typeof getProgressSupabase>> }) {
  const [mode,setMode]=useState<"login"|"signup">("login");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    try {
      if(mode==="signup") {
        const {data,error:authError}=await supabase.auth.signUp({email:email.trim(),password});
        if(authError) throw authError;
        setMessage(data.session ? "Akun berhasil dibuat. Anda sudah masuk." : "Akun berhasil didaftarkan. Periksa email untuk konfirmasi sebelum masuk.");
      } else {
        const {error:authError}=await supabase.auth.signInWithPassword({email:email.trim(),password});
        if(authError) throw authError;
      }
    } catch(cause) {
      setError(cause instanceof Error?cause.message:"Autentikasi gagal.");
    } finally { setLoading(false); }
  }

  return <div className="login-page">
    <section className="login-aside">
      <div className="brand"><div className="brand-mark">D</div><div><strong>DAHLIA PROJECT</strong><small>Progress Control</small></div></div>
      <h1>Kontrol progres pekerjaan dengan satu kurva yang jelas.</h1>
      <p>Catat realisasi kumulatif tiap item pekerjaan, bandingkan dengan rencana, dan pantau bobot pekerjaan dari RAB proyek Anda.</p>
      <div className="login-features">
        <div className="login-feature"><b>✓</b> Bobot item otomatis berdasarkan nilai RAB</div>
        <div className="login-feature"><b>✓</b> Snapshot progres per tanggal laporan</div>
        <div className="login-feature"><b>✓</b> Kurva S rencana dan realisasi</div>
      </div>
    </section>
    <section className="login-card-wrap"><form className="login-card" onSubmit={submit}>
      <div className="eyebrow">Dahlia Project Progress</div>
      <h2>{mode==="login"?"Masuk ke aplikasi":"Buat akun pengguna"}</h2>
      <p>{mode==="login"?"Gunakan akun untuk mengelola proyek dan laporan progres.":"Buat akun agar data proyek dan RAB tersimpan secara privat."}</p>
      <label className="field">Email<input type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="nama@email.com"/></label>
      <label className="field">Password<input type="password" required minLength={6} value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Minimal 6 karakter"/></label>
      {error&&<div className="error-box">{error}</div>}
      {message&&<div className="info-box">{message}</div>}
      <button className="btn primary" type="submit" disabled={loading} style={{width:"100%",justifyContent:"center",marginTop:16}}>{loading?"Memproses…":mode==="login"?"Masuk":"Daftar akun"}</button>
      <div className="login-switch">{mode==="login"?"Belum mempunyai akun?":"Sudah mempunyai akun?"} <button type="button" className="link-btn" onClick={()=>{setMode(mode==="login"?"signup":"login");setError("");setMessage("");}}>{mode==="login"?"Buat akun":"Masuk"}</button></div>
    </form></section>
  </div>;
}

export default function HomePage() {
  const supabase = useMemo(()=>getProgressSupabase(),[]);
  const [session,setSession]=useState<any>(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [view,setView]=useState<View>("dashboard");
  const [projects,setProjects]=useState<Project[]>([]);
  const [project,setProject]=useState<Project|null>(null);
  const [items,setItems]=useState<BoqItem[]>([]);
  const [reports,setReports]=useState<Report[]>([]);
  const [reportItems,setReportItems]=useState<ReportItem[]>([]);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [toast,setToast]=useState("");
  const [projectDraft,setProjectDraft]=useState<ProjectDraft>(emptyProject);
  const [showProjectForm,setShowProjectForm]=useState(false);
  const [itemDraft,setItemDraft]=useState<ItemDraft>(emptyItem);
  const [editingItemId,setEditingItemId]=useState<string|null>(null);
  const [reportDate,setReportDate]=useState(localDateKey(new Date()));
  const [reportNotes,setReportNotes]=useState("");
  const [draftProgress,setDraftProgress]=useState<Record<string,string>>({});
  const [showReportForm,setShowReportForm]=useState(false);
  const [search,setSearch]=useState("");

  useEffect(()=>{
    if(!supabase){setAuthLoading(false);return;}
    const boot=async()=>{
      const {data}=await supabase.auth.getSession();
      setSession(data.session);
      setAuthLoading(false);
    };
    void boot();
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));
    return ()=>subscription.unsubscribe();
  },[supabase]);

  const loadProjects=useCallback(async()=>{
    if(!supabase||!session?.user)return;
    const {data,error:queryError}=await supabase.from("progress_projects").select("*").order("updated_at",{ascending:false});
    if(queryError)throw queryError;
    const rows=(data||[]) as Project[];
    setProjects(rows);
    setProject((current)=>rows.find((item)=>item.id===current?.id)||rows[0]||null);
    if(!rows.length){setItems([]);setReports([]);setReportItems([]);}
  },[supabase,session?.user?.id]);

  const loadProjectData=useCallback(async(target:Project)=>{
    if(!supabase)return;
    setLoading(true);setError("");
    try{
      const [itemResult,reportResult]=await Promise.all([
        supabase.from("progress_boq_items").select("*").eq("project_id",target.id).eq("boq_version",target.current_boq_version).eq("is_active",true).order("sort_order").order("item_code"),
        supabase.from("progress_reports").select("*").eq("project_id",target.id).order("report_date",{ascending:true}),
      ]);
      if(itemResult.error)throw itemResult.error;
      if(reportResult.error)throw reportResult.error;
      const nextItems=(itemResult.data||[]) as BoqItem[];
      const nextReports=(reportResult.data||[]) as Report[];
      setItems(nextItems);setReports(nextReports);
      if(nextReports.length){
        const ids=nextReports.map((report)=>report.id);
        const {data,error:detailError}=await supabase.from("progress_report_items").select("*").in("report_id",ids);
        if(detailError)throw detailError;
        setReportItems((data||[]) as ReportItem[]);
        const last=nextReports[nextReports.length-1];
        setReportDate(last.report_date);setReportNotes(last.notes||"");
        const lastValues=Object.fromEntries(((data||[]) as ReportItem[]).filter((row)=>row.report_id===last.id).map((row)=>[row.boq_item_id,String(row.cumulative_percent)]));
        setDraftProgress(lastValues);
      }else{
        setReportItems([]);setReportDate(target.start_date);setReportNotes("");
        setDraftProgress(Object.fromEntries(nextItems.map((item)=>[item.id,"0"])));
      }
    }catch(cause){setError(cause instanceof Error?cause.message:"Data proyek gagal dimuat.");}
    finally{setLoading(false);}
  },[supabase]);

  useEffect(()=>{if(session?.user&&supabase)void loadProjects().catch((cause)=>setError(cause instanceof Error?cause.message:"Daftar proyek gagal dimuat."));},[session?.user?.id,supabase,loadProjects]);
  useEffect(()=>{if(project)void loadProjectData(project);},[project?.id,project?.current_boq_version,loadProjectData]);

  const weights=useMemo(()=>calculateWeights(items),[items]);
  const currentVersionReports=useMemo(()=>reports.filter((row)=>row.boq_version===(project?.current_boq_version||1)),[reports,project?.current_boq_version]);
  const latestReport=currentVersionReports[currentVersionReports.length-1]||null;
  const latestReportItems=useMemo(()=>latestReport?reportItems.filter((row)=>row.report_id===latestReport.id):[],[latestReport,reportItems]);
  const actualProgress=latestReport?reportProgress(latestReportItems):0;
  const targetProgress=project&&items.length?plannedProgress(project,items,latestReport?.report_date||reportDate):0;
  const deviation=actualProgress-targetProgress;
  const curvePoints=useMemo(()=>project?buildCurvePoints(project,items,reports,reportItems):[],[project,items,reports,reportItems]);

  const currentReportId=reports.find((item)=>item.report_date===reportDate)?.id;
  const reportLocked=Boolean(currentReportId);
  const itemEditingLocked=currentVersionReports.length>0;
  const filteredItems=items.filter((item)=>[item.item_code,item.description,item.work_group].join(" ").toLowerCase().includes(search.toLowerCase()));

  async function createProject(event:FormEvent){
    event.preventDefault();if(!supabase||!session?.user)return;
    if(projectDraft.end_date<projectDraft.start_date){setError("Tanggal selesai harus setelah tanggal mulai.");return;}
    setSaving(true);setError("");
    try{
      const {data,error:insertError}=await supabase.from("progress_projects").insert({
        owner_id:session.user.id,name:projectDraft.name.trim(),client_name:projectDraft.client_name.trim(),
        location:projectDraft.location.trim(),contract_number:projectDraft.contract_number.trim(),
        start_date:projectDraft.start_date,end_date:projectDraft.end_date,current_boq_version:1,
      }).select("*").single();
      if(insertError)throw insertError;
      const newProject=data as Project;
      setProjects((current)=>[newProject,...current]);setProject(newProject);setProjectDraft(emptyProject);setShowProjectForm(false);setView("rab");
      setToast("Proyek berhasil dibuat. Selanjutnya susun RAB item pekerjaan.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Proyek gagal dibuat.");}
    finally{setSaving(false);}
  }

  async function saveItem(event:FormEvent){
    event.preventDefault();if(!supabase||!project)return;
    setSaving(true);setError("");
    const payload={
      project_id:project.id,boq_version:project.current_boq_version,
      item_code:itemDraft.item_code.trim(),work_group:itemDraft.work_group.trim()||"Umum",
      description:itemDraft.description.trim(),unit:itemDraft.unit.trim()||"ls",
      quantity:Number(itemDraft.quantity||0),unit_price:Number(itemDraft.unit_price||0),
      planned_start_date:itemDraft.planned_start_date||project.start_date,
      planned_end_date:itemDraft.planned_end_date||project.end_date,
      sort_order:items.length+1,is_active:true,updated_at:new Date().toISOString(),
    };
    try{
      const result=editingItemId
        ? await supabase.from("progress_boq_items").update(payload).eq("id",editingItemId).eq("project_id",project.id)
        : await supabase.from("progress_boq_items").insert(payload);
      if(result.error)throw result.error;
      setItemDraft(emptyItem);setEditingItemId(null);await loadProjectData(project);setToast("Item RAB berhasil disimpan.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Item RAB gagal disimpan.");}
    finally{setSaving(false);}
  }

  async function deleteItem(item:BoqItem){
    if(!supabase||!project||!window.confirm(`Hapus item ${item.item_code} – ${item.description}?`))return;
    const {error:deleteError}=await supabase.from("progress_boq_items").delete().eq("id",item.id).eq("project_id",project.id);
    if(deleteError){setError(deleteError.message);return;}
    await loadProjectData(project);setToast("Item RAB dihapus.");
  }

  function startEditItem(item:BoqItem){
    setEditingItemId(item.id);
    setItemDraft({
      id:item.id,item_code:item.item_code,work_group:item.work_group,description:item.description,unit:item.unit,
      quantity:String(item.quantity),unit_price:String(item.unit_price),
      planned_start_date:item.planned_start_date||project?.start_date||"",
      planned_end_date:item.planned_end_date||project?.end_date||"",
    });
  }

  async function createBoqRevision(){
    if(!supabase||!project||!window.confirm("Buat versi RAB baru? Seluruh item aktif akan disalin ke versi baru. Riwayat laporan versi lama tetap tersimpan dan tidak akan dihitung ulang."))return;
    setSaving(true);setError("");
    try{
      const {data,error:rpcError}=await supabase.rpc("progress_create_boq_revision",{p_project_id:project.id});
      if(rpcError)throw rpcError;
      const revised={...project,current_boq_version:Number(data)};
      setProject(revised);setProjects((current)=>current.map((row)=>row.id===project.id?revised:row));
      setToast(`Versi RAB ${data} dibuat. Anda dapat mengubah item tanpa menimpa laporan versi sebelumnya.`);
    }catch(cause){setError(cause instanceof Error?cause.message:"Revisi RAB gagal dibuat.");}
    finally{setSaving(false);}
  }

  async function loadDraftForDate(value:string){
    if(!supabase||!project)return;
    setReportDate(value);
    const existing=currentVersionReports.find((row)=>row.report_date===value);
    const source=existing||[...currentVersionReports].reverse().find((row)=>row.report_date<value);
    if(!source){
      setReportNotes("");
      setDraftProgress(Object.fromEntries(items.map((item)=>[item.id,"0"])));
      return;
    }
    setReportNotes(source.notes||"");
    const rows=reportItems.filter((row)=>row.report_id===source.id);
    setDraftProgress(Object.fromEntries(items.map((item)=>[item.id,String(rows.find((row)=>row.boq_item_id===item.id)?.cumulative_percent??0)])));
  }

  async function saveProgressReport(event:FormEvent){
    event.preventDefault();if(!supabase||!project)return;
    if(reportDate<project.start_date||reportDate>project.end_date){setError("Tanggal laporan berada di luar periode proyek.");return;}
    if(!items.length||weights.total<=0){setError("RAB belum tersedia atau total nilai RAB masih nol.");return;}
    const itemPayload=items.map((item)=>({
      item_id:item.id,cumulative_percent:Number(draftProgress[item.id]??0),
    }));
    if(itemPayload.some((row)=>!Number.isFinite(row.cumulative_percent)||row.cumulative_percent<0||row.cumulative_percent>100)){
      setError("Progres tiap item harus berada antara 0 sampai 100 persen.");return;
    }
    setSaving(true);setError("");
    try{
      const {error:rpcError}=await supabase.rpc("progress_save_report",{
        p_project_id:project.id,p_report_date:reportDate,p_notes:reportNotes,p_items:itemPayload,
      });
      if(rpcError)throw rpcError;
      await loadProjectData(project);setToast("Laporan progres kumulatif berhasil disimpan.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Laporan progres gagal disimpan.");}
    finally{setSaving(false);}
  }

  async function signOut(){if(!supabase)return;await supabase.auth.signOut();setProjects([]);setProject(null);}

  if(!supabase){
    return <div className="login-page"><section className="login-aside"><div className="brand"><div className="brand-mark">D</div><div><strong>DAHLIA PROJECT</strong><small>Progress Control</small></div></div><h1>Kurva S lapangan, terukur dari RAB.</h1><p>Aplikasi sudah disiapkan. Database proyek mandiri perlu dikonfigurasi melalui environment variable Vercel sebelum pengguna dapat masuk.</p></section><section className="login-card-wrap"><div className="login-card"><div className="eyebrow">Konfigurasi aplikasi</div><h2>Database belum dihubungkan</h2><p>Tambahkan NEXT_PUBLIC_PROGRESS_SUPABASE_URL dan NEXT_PUBLIC_PROGRESS_SUPABASE_PUBLISHABLE_KEY pada environment project Vercel Dahlia Project Progress.</p><div className="info-box">Database khusus aplikasi ini akan dibuat terpisah dari Dahlia BKU. Tidak ada data BKU yang dibaca atau diubah.</div></div></section></div>;
  }
  if(authLoading)return <div className="loading">Memeriksa sesi pengguna…</div>;
  if(!session)return <LoginPanel supabase={supabase}/>;

  const tabTitle:Record<View,string>={
    dashboard:"Ringkasan Proyek",projects:"Master Proyek",rab:"Rencana Anggaran Biaya",progress:"Input Progres Lapangan",reports:"Riwayat Laporan",
  };
  const currentUser=session.user.email||"Pengguna";
  const lastDate=latestReport?.report_date||"Belum ada";
  const hasRAB=items.length>0;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">D</div><div><strong>DAHLIA PROJECT</strong><small>Progress Control</small></div></div>
      <div>
        <div className="nav-label">Menu utama</div>
        <nav className="nav-list">
          {([
            ["dashboard",BarChart3,"Dashboard"],["projects",FolderKanban,"Master Proyek"],["rab",ClipboardList,"RAB Pekerjaan"],["progress",Activity,"Input Progres"],["reports",CalendarDays,"Riwayat Laporan"],
          ] as const).map(([id,Icon,label])=><button key={id} className={`nav-btn ${view===id?"active":""}`} onClick={()=>setView(id)}><Icon size={16}/>{label}</button>)}
        </nav>
      </div>
      <div className="side-project"><small>Proyek aktif</small><strong>{project?.name||"Belum ada proyek"}</strong><span>{project? `RAB v${project.current_boq_version} · ${dateLabel(project.start_date,{month:"short",year:"numeric"})} – ${dateLabel(project.end_date,{month:"short",year:"numeric"})}`:"Buat proyek untuk mulai menyusun RAB."}</span></div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left"><div><div className="eyebrow">DAHLIA PROJECT PROGRESS</div><h1>{tabTitle[view]}</h1></div></div>
        <div className="user-chip"><div className="avatar">{currentUser.slice(0,1).toUpperCase()}</div><span>{currentUser}</span><button className="btn small" onClick={()=>void signOut()}><LogOut size={12}/> Keluar</button></div>
      </header>
      <div className="content">
        {error&&<div className="error-box" style={{marginBottom:14,display:"flex",justifyContent:"space-between",gap:10}}><span>{error}</span><button className="link-btn" onClick={()=>setError("")}><X size={13}/></button></div>}
        {loading&&<div className="info-box" style={{marginBottom:12}}>Memuat data proyek…</div>}
        {!projects.length&&!showProjectForm&&<div className="empty-state"><FolderKanban size={30}/><h3>Belum ada proyek terdaftar</h3><p>Buat proyek pertama, masukkan data kontrak dan periode pekerjaan, kemudian susun item RAB untuk membentuk bobot Kurva S.</p><button className="btn primary" style={{marginTop:16}} onClick={()=>{setView("projects");setShowProjectForm(true);}}><Plus size={14}/> Buat proyek pertama</button></div>}
        {view==="projects"&&<section>
          <div className="page-heading"><div><h2>Master proyek</h2><p>Kelola proyek, lokasi pekerjaan, nilai kontrak, dan periode pelaksanaan.</p></div><div className="heading-actions"><button className="btn primary" onClick={()=>setShowProjectForm((v)=>!v)}><Plus size={14}/> Tambah proyek</button></div></div>
          {showProjectForm&&<form className="card section-gap" onSubmit={createProject}>
            <div className="card-title"><div><h3>Data proyek baru</h3><p>Data proyek berdiri sendiri pada aplikasi Dahlia Project Progress.</p></div><button className="btn small" type="button" onClick={()=>setShowProjectForm(false)}><X size={13}/></button></div>
            <div className="field-grid">
              <label className="field">Nama proyek<input required value={projectDraft.name} onChange={(e)=>setProjectDraft({...projectDraft,name:e.target.value})} placeholder="Contoh: Pembangunan Gedung PAUD"/></label>
              <label className="field">Pemilik / pemberi kerja<input value={projectDraft.client_name} onChange={(e)=>setProjectDraft({...projectDraft,client_name:e.target.value})} placeholder="Nama instansi / klien"/></label>
              <label className="field">Lokasi pekerjaan<input value={projectDraft.location} onChange={(e)=>setProjectDraft({...projectDraft,location:e.target.value})} placeholder="Alamat / kecamatan"/></label>
              <label className="field">Nomor kontrak<input value={projectDraft.contract_number} onChange={(e)=>setProjectDraft({...projectDraft,contract_number:e.target.value})} placeholder="Nomor kontrak"/></label>
              <label className="field">Tanggal mulai<input type="date" required value={projectDraft.start_date} onChange={(e)=>setProjectDraft({...projectDraft,start_date:e.target.value})}/></label>
              <label className="field">Tanggal selesai<input type="date" required value={projectDraft.end_date} onChange={(e)=>setProjectDraft({...projectDraft,end_date:e.target.value})}/></label>
            </div>
            <div className="form-actions"><button className="btn primary" disabled={saving}><Save size={13}/>{saving?"Menyimpan…":"Simpan proyek"}</button></div>
          </form>}
          <div className="grid section-gap">
            {projects.map((row)=><div key={row.id} className="card" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:15}}>
              <div><div className="eyebrow">{row.contract_number||"PROYEK"}</div><h3 style={{margin:"4px 0",fontSize:14}}>{row.name}</h3><div className="td-muted">{row.client_name||"Pemberi kerja belum diisi"} · {row.location||"Lokasi belum diisi"}</div><div className="td-muted" style={{marginTop:4}}>{dateLabel(row.start_date)} – {dateLabel(row.end_date)} · RAB v{row.current_boq_version}</div></div>
              <button className={`btn ${project?.id===row.id?"primary":"soft"}`} onClick={()=>{setProject(row);setView("dashboard");}}>{project?.id===row.id?"Terpilih":"Buka proyek"}</button>
            </div>)}
          </div>
        </section>}
        {view==="dashboard"&&<section>
          <div className="page-heading"><div><h2>{project?.name||"Pilih proyek"}</h2><p>{project? `${project.client_name||"Pemberi kerja belum diisi"} · ${project.location||"Lokasi belum diisi"}`:"Pilih atau buat proyek untuk mulai."}</p></div><div className="heading-actions"><button className="btn" onClick={()=>void loadProjects()}><RefreshCw size={13}/> Refresh</button><button className="btn primary" onClick={()=>setView("progress")} disabled={!project}><Plus size={13}/> Input progres</button></div></div>
          {project&&<><div className="grid stats-grid">
            <div className="stat-card"><div className="stat-head">Total nilai RAB <span className="stat-icon"><WalletCards size={16}/></span></div><div className="stat-value">{money(weights.total)}</div><div className="stat-foot">{items.length} item aktif · RAB versi {project.current_boq_version}</div></div>
            <div className="stat-card"><div className="stat-head">Progres aktual <span className="stat-icon"><Activity size={16}/></span></div><div className="stat-value" style={{color:"#118f80"}}>{number(actualProgress,2)}%</div><div className="stat-foot">Laporan terakhir {lastDate==="Belum ada"?"belum tersedia":dateLabel(lastDate)}</div></div>
            <div className="stat-card"><div className="stat-head">Target rencana <span className="stat-icon"><TrendingUp size={16}/></span></div><div className="stat-value" style={{color:"#3479c7"}}>{number(targetProgress,2)}%</div><div className="stat-foot">Target pada tanggal laporan terakhir</div></div>
            <div className="stat-card"><div className="stat-head">Deviasi terhadap rencana <span className="stat-icon">{deviation>=0?<ArrowUpRight size={16}/>:<ArrowDownRight size={16}/>}</span></div><div className="stat-value" style={{color:deviation>=0?"#118f80":"#bc6c3d"}}>{deviation>0?"+":""}{number(deviation,2)}%</div><div className="stat-foot">{deviation>=0?"Di atas atau sesuai rencana":"Di bawah rencana"}</div></div>
          </div>
          <div className="grid two-col">
            <div className="card"><div className="card-title"><div><h3>Kurva S proyek</h3><p>Perbandingan progres rencana dan realisasi berdasarkan bobot RAB.</p></div><span className="badge">RAB v{project.current_boq_version}</span></div><CurveChart points={curvePoints}/><div className="info-box" style={{marginTop:8}}>Garis rencana dihitung dari jadwal mulai–selesai tiap item dengan pola smoothstep (awal dan akhir landai, bagian tengah lebih cepat). Sesuaikan jadwal item pada RAB untuk mengubah kurva rencana.</div></div>
            <div className="card"><div className="card-title"><div><h3>Informasi pelaksanaan</h3><p>Periode dan catatan pelaporan proyek.</p></div></div>
              <div style={{display:"grid",gap:13}}>
                <div><div className="eyebrow">PERIODE KONTRAK</div><strong>{dateLabel(project.start_date)} – {dateLabel(project.end_date)}</strong></div>
                <div><div className="eyebrow">NOMOR KONTRAK</div><strong>{project.contract_number||"Belum diisi"}</strong></div>
                <div><div className="eyebrow">LAPORAN TERSIMPAN</div><strong>{reports.length} tanggal laporan</strong></div>
                <div><div className="eyebrow">NILAI PROGRES FISIK</div><strong>{money(weights.total*actualProgress/100)}</strong></div>
                <button className="btn soft" onClick={()=>setView("reports")}><CalendarDays size={13}/> Lihat riwayat laporan</button>
              </div>
            </div>
          </div>
          <div className="card section-gap"><div className="card-title"><div><h3>Komposisi bobot pekerjaan</h3><p>Item dengan nilai RAB lebih besar memiliki kontribusi bobot lebih tinggi terhadap progres total.</p></div><button className="btn small" onClick={()=>setView("rab")}>Buka RAB</button></div>
            {!items.length?<div className="empty-state"><ClipboardList size={25}/><h3>RAB belum disusun</h3><p>Tambahkan item pekerjaan dan nilai RAB terlebih dahulu untuk membentuk bobot dan Kurva S.</p><button className="btn primary" style={{marginTop:13}} onClick={()=>setView("rab")}>Susun RAB</button></div>
            :<div className="table-wrap"><table><thead><tr><th>Item pekerjaan</th><th className="number-cell">Nilai RAB</th><th className="number-cell">Bobot</th><th>Progres aktual</th><th className="number-cell">Kontribusi</th></tr></thead><tbody>
              {items.slice().sort((a,b)=>itemAmount(b)-itemAmount(a)).slice(0,7).map((item)=>{
                const weight=weights.weights[item.id]||0;
                const snapshot=latestReportItems.find((row)=>row.boq_item_id===item.id);
                const pct=Number(snapshot?.cumulative_percent||0);
                return <tr key={item.id}><td><div className="td-strong">{item.description}</div><div className="td-muted">{item.item_code} · {item.work_group}</div></td><td className="number-cell">{money(itemAmount(item))}</td><td className="number-cell">{formatWeight(weight)}</td><td><div style={{display:"flex",alignItems:"center",gap:8}}><div className="progress-track" style={{flex:1}}><div className="progress-fill" style={{width:`${pct}%`}}/></div><span className="td-muted">{number(pct,1)}%</span></div></td><td className="number-cell td-strong">{formatWeight(weight*pct/100)}</td></tr>;
              })}
            </tbody></table></div>}
          </div></>}
        </section>}
        {view==="rab"&&<section>
          <div className="page-heading"><div><h2>Rencana Anggaran Biaya</h2><p>Masukkan item pekerjaan dan jadwal pelaksanaan. Bobot dihitung otomatis dari nilai tiap item dibanding total RAB.</p></div><div className="heading-actions"><span className="badge">RAB v{project?.current_boq_version||1}</span>{currentVersionReports.length>0&&<button className="btn soft" onClick={()=>void createBoqRevision()} disabled={saving}><GitBranchPlus size={13}/> Buat revisi RAB</button>}</div></div>
          {!project?<div className="empty-state">Buat atau pilih proyek terlebih dahulu.</div>:<>
            {itemEditingLocked&&<div className="warn-box" style={{marginBottom:14}}>Versi RAB ini sudah digunakan pada {reports.length} laporan progres. Item dikunci untuk menjaga bobot historis. Gunakan <strong>Buat revisi RAB</strong> untuk menyusun baseline baru tanpa mengubah riwayat versi sebelumnya.</div>}
            {!itemEditingLocked&&<form className="card" onSubmit={saveItem}>
              <div className="card-title"><div><h3>{editingItemId?"Ubah item RAB":"Tambah item pekerjaan"}</h3><p>Isi volume dan harga satuan; jumlah dan bobot dihitung otomatis.</p></div>{editingItemId&&<button type="button" className="btn small" onClick={()=>{setEditingItemId(null);setItemDraft(emptyItem);}}>Batal ubah</button>}</div>
              <div className="field-grid">
                <label className="field">Kode item<input required value={itemDraft.item_code} onChange={(e)=>setItemDraft({...itemDraft,item_code:e.target.value})} placeholder="A.1"/></label>
                <label className="field">Kelompok pekerjaan<input required value={itemDraft.work_group} onChange={(e)=>setItemDraft({...itemDraft,work_group:e.target.value})} placeholder="Pekerjaan Persiapan"/></label>
                <label className="field">Uraian pekerjaan<input required value={itemDraft.description} onChange={(e)=>setItemDraft({...itemDraft,description:e.target.value})} placeholder="Pekerjaan galian pondasi"/></label>
                <label className="field">Satuan<input required value={itemDraft.unit} onChange={(e)=>setItemDraft({...itemDraft,unit:e.target.value})} placeholder="m3"/></label>
                <label className="field">Volume<input type="number" min="0" step="0.0001" required value={itemDraft.quantity} onChange={(e)=>setItemDraft({...itemDraft,quantity:e.target.value})}/></label>
                <label className="field">Harga satuan (Rp)<input type="number" min="0" step="1" required value={itemDraft.unit_price} onChange={(e)=>setItemDraft({...itemDraft,unit_price:e.target.value})}/></label>
                <label className="field">Rencana mulai<input type="date" required value={itemDraft.planned_start_date||project.start_date} onChange={(e)=>setItemDraft({...itemDraft,planned_start_date:e.target.value})}/></label>
                <label className="field">Rencana selesai<input type="date" required value={itemDraft.planned_end_date||project.end_date} onChange={(e)=>setItemDraft({...itemDraft,planned_end_date:e.target.value})}/></label>
              </div>
              <div className="info-box" style={{marginTop:12}}>Nilai item saat ini: <strong>{money(Number(itemDraft.quantity||0)*Number(itemDraft.unit_price||0))}</strong>.</div>
              <div className="form-actions"><button className="btn primary" disabled={saving}><Plus size={13}/>{saving?"Menyimpan…":"Simpan item RAB"}</button></div>
            </form>}
            <div className="grid stats-grid section-gap">
              <div className="stat-card"><div className="stat-head">Total RAB</div><div className="stat-value">{money(weights.total)}</div><div className="stat-foot">Versi aktif {project.current_boq_version}</div></div>
              <div className="stat-card"><div className="stat-head">Jumlah item</div><div className="stat-value">{items.length}</div><div className="stat-foot">Item pekerjaan aktif</div></div>
              <div className="stat-card"><div className="stat-head">Total kelompok</div><div className="stat-value">{new Set(items.map((item)=>item.work_group)).size}</div><div className="stat-foot">Kelompok pekerjaan</div></div>
              <div className="stat-card"><div className="stat-head">Bobot total</div><div className="stat-value">100%</div><div className="stat-foot">Dinormalisasi dari total nilai RAB</div></div>
            </div>
            <div className="card section-gap"><div className="card-title"><div><h3>Daftar item RAB</h3><p>Bobot tiap item = nilai item ÷ total RAB × 100%.</p></div></div>
              {!items.length?<div className="empty-state"><ClipboardList size={25}/><h3>Belum ada item pekerjaan</h3><p>Gunakan formulir di atas untuk menambahkan item dari RAB proyek.</p></div>:
              <div className="table-wrap"><table><thead><tr><th>Kode</th><th>Kelompok / uraian</th><th className="number-cell">Volume</th><th className="number-cell">Harga satuan</th><th className="number-cell">Jumlah</th><th className="number-cell">Bobot</th><th>Jadwal rencana</th><th>Aksi</th></tr></thead><tbody>
                {filteredItems.map((item)=><tr key={item.id}><td className="td-strong">{item.item_code}</td><td><div className="td-strong">{item.description}</div><div className="td-muted">{item.work_group}</div></td><td className="number-cell">{number(item.quantity,4)} {item.unit}</td><td className="number-cell">{money(item.unit_price)}</td><td className="number-cell td-strong">{money(itemAmount(item))}</td><td className="number-cell td-strong">{formatWeight(weights.weights[item.id]||0)}</td><td><div>{dateLabel(item.planned_start_date||project.start_date,{day:"2-digit",month:"short"})}</div><div className="td-muted">s/d {dateLabel(item.planned_end_date||project.end_date,{day:"2-digit",month:"short",year:"numeric"})}</div></td><td><div style={{display:"flex",gap:5}}><button className="btn small" disabled={itemEditingLocked} onClick={()=>startEditItem(item)} title="Ubah"><Pencil size={12}/></button><button className="btn small danger" disabled={itemEditingLocked} onClick={()=>void deleteItem(item)} title="Hapus"><Trash2 size={12}/></button></div></td></tr>)}
              </tbody><tfoot><tr><th colSpan={4}>TOTAL RAB</th><th className="number-cell">{money(weights.total)}</th><th className="number-cell">100%</th><th colSpan={2}></th></tr></tfoot></table></div>}
            </div>
          </>}
        </section>}
        {view==="progress"&&<section>
          <div className="page-heading"><div><h2>Input progres lapangan</h2><p>Masukkan persentase kumulatif yang sudah tercapai sampai tanggal laporan. Nilai yang disimpan menjadi snapshot pada tanggal tersebut.</p></div><div className="heading-actions"><span className="badge">Kumulatif</span></div></div>
          {!project?<div className="empty-state">Buat atau pilih proyek terlebih dahulu.</div>:!items.length?<div className="empty-state"><ClipboardList size={25}/><h3>RAB belum tersedia</h3><p>Bobot pekerjaan harus tersedia sebelum progres lapangan dapat dihitung.</p><button className="btn primary" style={{marginTop:14}} onClick={()=>setView("rab")}>Susun RAB</button></div>:<>
            <form className="card" onSubmit={saveProgressReport}>
              <div className="field-grid">
                <label className="field">Tanggal laporan<input type="date" min={project.start_date} max={project.end_date} value={reportDate} onChange={(e)=>void loadDraftForDate(e.target.value)}/><small>Setiap tanggal hanya memiliki satu snapshot per versi RAB; menyimpan ulang tanggal yang sama akan memperbarui snapshot tersebut.</small></label>
                <label className="field">Catatan lapangan<input value={reportNotes} onChange={(e)=>setReportNotes(e.target.value)} placeholder="Contoh: progres mingguan, cuaca, kendala lapangan"/></label>
              </div>
              <div className="info-box" style={{marginTop:13}}>Isi progres keseluruhan item berdasarkan kondisi fisik sampai tanggal laporan, bukan progres tambahan sejak laporan sebelumnya. Item tanpa pekerjaan tetap diisi 0% atau nilai terakhirnya.</div>
              {currentReportId&&<div className="warn-box" style={{marginTop:10}}>Sudah ada laporan pada tanggal ini. Menyimpan ulang akan memperbarui snapshot tanggal yang sama, bukan menambahkan tanggal baru.</div>}
              <div className="table-wrap section-gap"><table><thead><tr><th>Kode / uraian pekerjaan</th><th className="number-cell">Nilai RAB</th><th className="number-cell">Bobot</th><th className="number-cell">Progres kumulatif (%)</th><th className="number-cell">Kontribusi progres</th></tr></thead><tbody>
                {items.map((item)=>{const weight=weights.weights[item.id]||0;const percent=Number(draftProgress[item.id]??0);return <tr key={item.id}><td><div className="td-strong">{item.item_code} · {item.description}</div><div className="td-muted">{item.work_group}</div></td><td className="number-cell">{money(itemAmount(item))}</td><td className="number-cell">{formatWeight(weight)}</td><td className="number-cell"><input className="inline-input" style={{textAlign:"right"}} type="number" min="0" max="100" step="0.01" required value={draftProgress[item.id]??"0"} onChange={(e)=>setDraftProgress((current)=>({...current,[item.id]:e.target.value}))}/></td><td className="number-cell td-strong">{formatWeight(weight*percent/100)}</td></tr>;})}
              </tbody></table></div>
              <div className="form-actions" style={{justifyContent:"space-between",alignItems:"center"}}><div><div className="eyebrow">PROGRES TERTIMBANG PADA TANGGAL INI</div><strong style={{fontSize:23,color:"#168f7f"}}>{number(items.reduce((sum,item)=>sum+(weights.weights[item.id]||0)*Number(draftProgress[item.id]||0)/100,0),2)}%</strong></div><button className="btn primary" disabled={saving}><Save size={13}/>{saving?"Menyimpan…":"Simpan laporan progres"}</button></div>
            </form>
          </>}
        </section>}
        {view==="reports"&&<section>
          <div className="page-heading"><div><h2>Riwayat laporan progres</h2><p>Setiap tanggal laporan menyimpan snapshot kumulatif per item untuk versi RAB aktif.</p></div><div className="heading-actions"><button className="btn" onClick={()=>window.print()} disabled={!reports.length}><Printer size={13}/> Cetak</button><button className="btn primary" onClick={()=>setView("progress")} disabled={!project}><Plus size={13}/> Laporan baru</button></div></div>
          {!reports.length?<div className="empty-state"><CalendarDays size={25}/><h3>Belum ada laporan progres</h3><p>Input progres lapangan untuk membuat riwayat dan membentuk garis aktual Kurva S.</p></div>:
          <div className="card"><div className="card-title"><div><h3>Daftar tanggal laporan</h3><p>RAB versi {project?.current_boq_version||1}</p></div></div><div className="table-wrap"><table><thead><tr><th>Tanggal laporan</th><th>Versi RAB</th><th className="number-cell">Progres aktual</th><th className="number-cell">Target rencana</th><th className="number-cell">Deviasi</th><th>Catatan</th><th>Aksi</th></tr></thead><tbody>
            {reports.slice().reverse().map((report)=>{const value=reportProgress(reportItems.filter((row)=>row.report_id===report.id));const sameVersion=report.boq_version===project?.current_boq_version;const plan=sameVersion&&project&&items.length?plannedProgress(project,items,report.report_date):null;const diff=plan===null?null:value-plan;return <tr key={report.id}><td className="td-strong">{dateLabel(report.report_date)}</td><td><span className={`badge ${sameVersion?"":"gray"}`}>RAB v{report.boq_version}</span></td><td className="number-cell td-strong">{number(value,2)}%</td><td className="number-cell">{plan===null?"—":`${number(plan,2)}%`}</td><td className="number-cell" style={{color:diff===null?"#8794a6":diff>=0?"#128b79":"#bc6d40"}}>{diff===null?"Versi lama":`${diff>0?"+":""}${number(diff,2)}%`}</td><td>{report.notes||"—"}</td><td><button className="btn small" disabled={!sameVersion} onClick={()=>{setReportDate(report.report_date);const rows=reportItems.filter((row)=>row.report_id===report.id);setDraftProgress(Object.fromEntries(items.map((item)=>[item.id,String(rows.find((row)=>row.boq_item_id===item.id)?.cumulative_percent??0)])));setReportNotes(report.notes||"");setView("progress");}}>{sameVersion?"Lihat / ubah":"Riwayat tersimpan"}</button></td></tr>;})}
          </tbody></table></div></div>}
        </section>}
      </div>
    </main>
    {toast&&<div className="toast" role="status" onClick={()=>setToast("")}>{toast}</div>}
  </div>;
}
