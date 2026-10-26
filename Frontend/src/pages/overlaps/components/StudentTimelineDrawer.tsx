import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { transferApi } from '../../../api/modules/transfer.api';
import { queryKeys } from '../../../api/queryKeys';
import { History, Calendar, CheckCircle2, Clock, GitCommit } from 'lucide-react';

interface StudentTimelineDrawerProps {
  studentTokenId: string | null;
  studentRef?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const StudentTimelineDrawer: React.FC<StudentTimelineDrawerProps> = ({
  studentTokenId,
  studentRef,
  isOpen,
  onClose,
}) => {
  const { data: events, isLoading } = useQuery({
    queryKey: queryKeys.lifecycle.timeline(studentTokenId || ''),
    queryFn: () => transferApi.getStudentTimeline(studentTokenId!),
    enabled: Boolean(studentTokenId && isOpen),
  });

  if (!studentTokenId) return null;

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'ADMISSION':
      case 'TRANSFER_IN':
        return <Badge variant="verified" size="sm">{type}</Badge>;
      case 'WITHDRAWAL':
      case 'TRANSFER_OUT':
      case 'DROPOUT':
        return <Badge variant="danger" size="sm">{type}</Badge>;
      case 'CORRECTION':
        return <Badge variant="warning" size="sm">{type}</Badge>;
      default:
        return <Badge variant="outline" size="sm">{type}</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            Student Lifecycle Event Timeline
          </DialogTitle>
          <DialogDescription>
            Chronological audit log of enrolments, transfers, and status updates for student token{' '}
            <span className="font-mono text-indigo-300 font-semibold">{studentRef || studentTokenId}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isLoading && (
            <div className="py-12 text-center text-xs text-slate-400">
              Querying chronological lifecycle events...
            </div>
          )}

          {!isLoading && (!events || events.length === 0) && (
            <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/40 text-xs text-slate-500">
              No lifecycle events registered yet for this student token.
            </div>
          )}

          {!isLoading && events && events.length > 0 && (
            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
              {events.map((ev, idx) => (
                <div key={ev._id || idx} className="relative group">
                  {/* Dot */}
                  <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-slate-900 border-2 border-indigo-500 group-hover:scale-125 transition-transform" />

                  <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between">
                      {getEventBadge(ev.eventType)}
                      <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(ev.effectiveDate).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="text-xs text-slate-300 font-medium">
                      Institution: <span className="font-mono text-slate-100">{ev.institutionId}</span>
                    </div>

                    <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                      <span>{ev.programmeCode} ({ev.academicYear})</span>
                      <span className="text-slate-500">Status: {ev.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
