import { Download, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { fetchDemoScene, type SceneSpec } from "../api/scene";
import { LatticeScene } from "../scene/LatticeScene";

type LoadState = "loading" | "ready" | "error";

const loadStateClasses: Record<LoadState, string> = {
  error: "border-destructive/20 bg-destructive/10 text-destructive",
  loading: "border-amber-200 bg-amber-50 text-amber-800",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

export function App() {
  const [scene, setScene] = useState<SceneSpec | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  async function loadScene() {
    setLoadState("loading");
    try {
      const nextScene = await fetchDemoScene();
      setScene(nextScene);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }

  useEffect(() => {
    void loadScene();
  }, []);

  const summary = useMemo(() => {
    if (!scene) {
      return { atoms: "0", bonds: "0", preset: "..." };
    }

    return {
      atoms: scene.atoms.length.toString(),
      bonds: scene.bonds.length.toString(),
      preset: scene.view.preset,
    };
  }, [scene]);

  return (
    <main className="relative h-dvh min-w-80 overflow-hidden bg-background text-foreground">
      <section className="scene-stage absolute inset-0" aria-label="Crystal structure preview">
        {scene ? (
          <LatticeScene scene={scene} />
        ) : (
          <div
            className="grid h-full w-full place-items-center text-sm text-muted-foreground"
            data-state={loadState}
          >
            {loadState === "error" ? "Unable to load scene" : "Loading scene"}
          </div>
        )}
      </section>

      <aside
        className="absolute left-3 top-3 w-[calc(100vw-1.5rem)] rounded-lg border bg-card/90 p-4 shadow-xl shadow-foreground/10 backdrop-blur-md sm:left-5 sm:top-5 sm:w-[360px] sm:p-[18px]"
        aria-label="Scene controls"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-[0.72rem] font-bold uppercase text-muted-foreground">
              Pretty Lattice
            </p>
            <h1 className="text-xl font-semibold leading-tight">Demo Crystal</h1>
          </div>
          <Badge
            variant="outline"
            className={cn("min-w-16 rounded-full px-2 py-1", loadStateClasses[loadState])}
          >
            {loadState}
          </Badge>
        </div>

        <Separator className="my-4" />

        <div className="grid grid-cols-2 gap-4">
          <div className="min-h-14">
            <span className="block text-xs font-bold text-muted-foreground">Atoms</span>
            <strong className="mt-2 block text-3xl leading-none">{summary.atoms}</strong>
          </div>
          <div className="min-h-14 border-l pl-4">
            <span className="block text-xs font-bold text-muted-foreground">Bonds</span>
            <strong className="mt-2 block text-3xl leading-none">{summary.bonds}</strong>
          </div>
        </div>

        <Separator className="my-4" />

        <dl className="grid gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-xs font-bold text-muted-foreground">View</dt>
            <dd className="m-0 text-right text-sm">{summary.preset}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-xs font-bold text-muted-foreground">Projection</dt>
            <dd className="m-0 text-right text-sm">{scene?.view.projection ?? "orthographic"}</dd>
          </div>
        </dl>

        <TooltipProvider>
          <div className="mt-5 flex gap-2" aria-label="Preview actions">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" className="flex-1" onClick={() => void loadScene()}>
                  <RefreshCcw aria-hidden="true" />
                  <span>Reload</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reload demo scene</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex-1">
                  <Button variant="outline" className="w-full" disabled>
                    <Download aria-hidden="true" />
                    <span>Export</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>PNG export will be wired in a later slice.</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </aside>
    </main>
  );
}
