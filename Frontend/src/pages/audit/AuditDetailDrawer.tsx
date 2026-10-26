import React, { useState } from 'react';
import { X, Copy, Check, ShieldCheck, Terminal, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { format } from 'date-fns';
import type { AuditEvent } from '@/types/models';

interface AuditDetailDrawerProps {
  event: AuditEvent | null;
  onClose: () => void;
}

export const AuditDetailDrawer: React.FC<AuditDetailDrawerProps> = ({ event, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!event) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(event, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-card border-l border-border shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">Audit Record Details</h2>
              </div>
              <p className="text-xs text-muted-foreground font-mono">ID: {event._id}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Meta summary card */}
            <div className="grid grid-cols-2 gap-4 p-4 rounded-xl border border-border bg-muted/40">
              <div>
                <span className="text-[11px] text-muted-foreground block">Action Type</span>
                <span className="text-xs font-semibold text-foreground font-mono mt-0.5 inline-block">
                  {event.action}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Logged Timestamp</span>
                <span className="text-xs font-medium text-foreground mt-0.5 inline-block">
                  {format(new Date(event.createdAt), 'MMM d, yyyy HH:mm:ss')}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Target Entity</span>
                <span className="text-xs font-medium text-foreground font-mono mt-0.5 inline-block">
                  {event.entityType || '—'} {event.entityId ? `(${event.entityId})` : ''}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Institution Context</span>
                <span className="text-xs font-medium text-foreground font-mono mt-0.5 inline-block">
                  {event.institutionId || 'Platform-Wide'}
                </span>
              </div>
            </div>

            {/* Performed By Actor */}
            <div className="p-4 rounded-xl border border-border bg-card space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5" />
                Actor Identity
              </h3>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Actor Email:</span>
                  <span className="font-medium text-foreground">{event.performedBy?.email || 'System Agent'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Role:</span>
                  {event.performedBy?.role ? (
                    <Badge variant="outline" size="sm">
                      {event.performedBy.role}
                    </Badge>
                  ) : (
                    <span className="font-mono text-muted-foreground">SYSTEM</span>
                  )}
                </div>
                {event.performedBy?.userId && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">User ID:</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {event.performedBy.userId}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Sanitized Audit Details JSON */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5" />
                  Sanitized Event Payload
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="h-7 text-xs gap-1.5"
                >
                  {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy JSON'}
                </Button>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 text-slate-100 border border-slate-800 font-mono text-xs overflow-x-auto max-h-96">
                <pre>{JSON.stringify(event.details || {}, null, 2)}</pre>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Integrity guarantee: All secrets, raw student tokens, and passwords are permanently stripped before logging.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Close Inspector
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
