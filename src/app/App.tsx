import { Button } from "@astryxdesign/core";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Brand } from "../components/Brand";
import { AppShell } from "./AppShell";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LoginPage } from "./auth/LoginPage";
import { SetupPage } from "./auth/SetupPage";
import { AppProviders } from "./providers";

const OverviewPage = lazy(() => import("../pages/OverviewPage").then((module) => ({ default: module.OverviewPage })));
const ChatPage = lazy(() => import("../pages/ChatPage").then((module) => ({ default: module.ChatPage })));
const ConversationsPage = lazy(() => import("../pages/ConversationsPage").then((module) => ({ default: module.ConversationsPage })));
const ProvidersPage = lazy(() => import("../pages/ProvidersPage").then((module) => ({ default: module.ProvidersPage })));
const ModelsRoutesPage = lazy(() => import("../pages/ModelsRoutesPage").then((module) => ({ default: module.ModelsRoutesPage })));
const ResearchPage = lazy(() => import("../pages/ResearchPage").then((module) => ({ default: module.ResearchPage })));
const TasksPage = lazy(() => import("../pages/TasksPage").then((module) => ({ default: module.TasksPage })));
const MemoryPage = lazy(() => import("../pages/MemoryPage").then((module) => ({ default: module.MemoryPage })));
const FilesPage = lazy(() => import("../pages/FilesPage").then((module) => ({ default: module.FilesPage })));
const KnowledgePage = lazy(() => import("../pages/KnowledgePage").then((module) => ({ default: module.KnowledgePage })));
const ToolsPage = lazy(() => import("../pages/ToolsPage").then((module) => ({ default: module.ToolsPage })));
const ApiKeysPage = lazy(() => import("../pages/ApiKeysPage").then((module) => ({ default: module.ApiKeysPage })));
const UsagePage = lazy(() => import("../pages/UsagePage").then((module) => ({ default: module.UsagePage })));
const AuditPage = lazy(() => import("../pages/AuditPage").then((module) => ({ default: module.AuditPage })));
const RuntimePage = lazy(() => import("../pages/RuntimePage").then((module) => ({ default: module.RuntimePage })));

export function App() { return <AppProviders><AuthProvider><AuthGate /></AuthProvider></AppProviders>; }

function AuthGate() {
  const auth = useAuth();
  if (auth.phase === "checking") return <BootScreen />;
  if (auth.phase === "setup") return <SetupPage />;
  if (auth.phase === "anonymous") return <LoginPage />;
  if (auth.phase === "unreachable") return <OfflineScreen onRetry={auth.refresh} message={auth.error?.message ?? "Helmora Hub could not be reached."} />;
  return <BrowserRouter><Suspense fallback={<PageLoader />}><Routes><Route element={<AppShell />}>
    <Route index element={<OverviewPage />} />
    <Route path="chat" element={<ChatPage />} />
    <Route path="conversations" element={<ConversationsPage />} />
    <Route path="research" element={<ResearchPage />} />
    <Route path="providers" element={<ProvidersPage />} />
    <Route path="models" element={<ModelsRoutesPage />} />
    <Route path="tasks" element={<TasksPage />} />
    <Route path="memory" element={<MemoryPage />} />
    <Route path="files" element={<FilesPage />} />
    <Route path="knowledge" element={<KnowledgePage />} />
    <Route path="tools" element={<ToolsPage />} />
    <Route path="api-keys" element={<ApiKeysPage />} />
    <Route path="usage" element={<UsagePage />} />
    <Route path="audit" element={<AuditPage />} />
    <Route path="runtime" element={<RuntimePage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route></Routes></Suspense></BrowserRouter>;
}

function BootScreen() { return <main className="boot-screen" aria-busy="true" aria-label="Helmora is preparing"><Brand compact /><span className="boot-screen__line" /><p>Connecting to Helmora Hub</p></main>; }
function PageLoader() { return <main className="route-loader" aria-busy="true"><span /><p>Preparing workspace</p></main>; }
function OfflineScreen({ onRetry, message }: { onRetry: () => Promise<void>; message: string }) { return <main className="offline-screen"><Brand /><p className="eyebrow">Connection interrupted</p><h1>Hub is out of reach.</h1><p>{message} Check that Helmora-Hub is running on the configured address, then try again.</p><Button label="Retry connection" variant="primary" onClick={() => { void onRetry(); }} /></main>; }
