import config from 'virtual:open-slide/config';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { connectGoogle, disconnectGoogle, isGoogleConnected } from '@/lib/google-auth';
import { useLocale } from '@/lib/use-locale';
import {
  getLinkedGooglePresentation,
  importGooglePresentationToSource,
  syncFromGoogleIfChanged,
} from '../../../google-slides/sync';

type Mode = 'import' | 'sync';

export function GoogleSlidesDialog({
  mode,
  slideId,
  open,
  onClose,
  onImported,
}: {
  mode: Mode;
  slideId: string;
  open: boolean;
  onClose: () => void;
  onImported?: (newSlideId?: string) => void;
}) {
  const t = useLocale();
  const [presentationUrl, setPresentationUrl] = useState('');
  const [newSlideId, setNewSlideId] = useState(`google-${slideId}`);
  const [busy, setBusy] = useState(false);
  const linked = getLinkedGooglePresentation(slideId);
  const clientId = config.googleClientId;

  const ensureAuth = async () => {
    if (isGoogleConnected()) return;
    if (!clientId) {
      throw new Error(t.slide.googleClientIdMissing);
    }
    await connectGoogle(clientId);
  };

  const runImport = async () => {
    setBusy(true);
    try {
      await ensureAuth();
      const { source, meta } = await importGooglePresentationToSource(presentationUrl, slideId);

      if (mode === 'import' && slideId !== newSlideId.trim()) {
        const res = await fetch('/__slides/import-google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newId: newSlideId.trim(), source }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error ?? t.slide.googleImportFailed);
        }
        const data = (await res.json()) as { slideId: string };
        toast.success(t.slide.googleImportSuccess);
        onImported?.(data.slideId);
      } else {
        const res = await fetch(`/__slides/${encodeURIComponent(slideId)}/google-import`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error ?? t.slide.googleImportFailed);
        }
        toast.success(t.slide.googleImportSuccess);
        onImported?.();
      }

      if (meta.presentationUrl) window.open(meta.presentationUrl, '_blank', 'noopener,noreferrer');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.slide.googleImportFailed);
    } finally {
      setBusy(false);
    }
  };

  const runSync = async () => {
    setBusy(true);
    try {
      await ensureAuth();
      const result = await syncFromGoogleIfChanged(slideId);
      if (!result.changed) {
        toast.message(t.slide.googleSyncUpToDate);
        onClose();
        return;
      }
      const res = await fetch(`/__slides/${encodeURIComponent(slideId)}/google-import`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: result.source }),
      });
      if (!res.ok) throw new Error(t.slide.googleSyncFailed);
      toast.success(t.slide.googleSyncSuccess);
      onImported?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.slide.googleSyncFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md" data-inspector-ui>
        <DialogHeader>
          <DialogTitle>
            {mode === 'import' ? t.slide.googleImportTitle : t.slide.googleSyncTitle}
          </DialogTitle>
          <DialogDescription>
            {mode === 'import' ? t.slide.googleImportDescription : t.slide.googleSyncDescription}
          </DialogDescription>
        </DialogHeader>

        {mode === 'import' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="google-presentation-url">{t.slide.googlePresentationUrlLabel}</Label>
              <Input
                id="google-presentation-url"
                value={presentationUrl}
                onChange={(e) => setPresentationUrl(e.target.value)}
                placeholder="https://docs.google.com/presentation/d/…/edit"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="google-new-slide-id">{t.slide.googleNewSlideIdLabel}</Label>
              <Input
                id="google-new-slide-id"
                value={newSlideId}
                onChange={(e) => setNewSlideId(e.target.value)}
              />
            </div>
          </div>
        )}

        {mode === 'sync' && linked && (
          <div className="rounded-[6px] border border-border bg-muted/30 p-3 text-[12px] leading-relaxed">
            <p className="font-medium">{linked.title}</p>
            <a
              href={linked.presentationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3" />
              {t.slide.googleOpenPresentation}
            </a>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {isGoogleConnected() && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                disconnectGoogle();
                toast.message(t.slide.googleDisconnect);
              }}
            >
              {t.slide.googleDisconnect}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            variant="brand"
            disabled={busy || (mode === 'import' && !presentationUrl.trim())}
            onClick={mode === 'import' ? runImport : runSync}
          >
            {mode === 'import' ? (
              t.slide.googleImportAction
            ) : (
              <>
                <RefreshCw className="size-3.5" />
                {t.slide.googleSyncAction}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
