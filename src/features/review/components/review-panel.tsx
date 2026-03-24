"use client";

import { useMemo, useState } from "react";
import type { ReviewProposal } from "@/src/features/review/types";

type ReviewPanelProps = {
  proposals: ReviewProposal[];
  documentTitleById: Record<string, string>;
};

type ProposalDecision = "pending" | "approved" | "rejected";

function labelForOpType(opType: ReviewProposal["operations"][number]["opType"]) {
  if (opType === "replace_text") return "Replace text";
  if (opType === "insert_before") return "Insert before";
  return "Insert after";
}

export function ReviewPanel({ proposals, documentTitleById }: ReviewPanelProps) {
  const [decisions, setDecisions] = useState<Record<string, ProposalDecision>>({});

  const summary = useMemo(() => {
    let approved = 0;
    let rejected = 0;
    for (const proposal of proposals) {
      const key = proposal.title;
      if (decisions[key] === "approved") approved += 1;
      if (decisions[key] === "rejected") rejected += 1;
    }
    return {
      total: proposals.length,
      approved,
      rejected,
      pending: Math.max(0, proposals.length - approved - rejected),
    };
  }, [decisions, proposals]);

  if (proposals.length === 0) {
    return (
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Edit Proposals</h2>
        <p className="mt-2 text-sm text-slate-600">
          No edit proposals yet. Switch to Edit mode and send a request to generate reviewable
          operations.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Edit Proposal Review</h2>
          <p className="mt-1 text-xs text-slate-600">
            Review each proposed operation before applying any changes.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
          <span className="font-medium">{summary.total}</span> total |{" "}
          <span className="font-medium text-emerald-700">{summary.approved}</span> approved |{" "}
          <span className="font-medium text-rose-700">{summary.rejected}</span> rejected |{" "}
          <span className="font-medium text-slate-700">{summary.pending}</span> pending
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {proposals.map((proposal, index) => {
          const proposalKey = proposal.title;
          const decision = decisions[proposalKey] ?? "pending";
          return (
            <article key={`${proposal.title}-${index}`} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{proposal.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{proposal.rationale}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                    decision === "approved"
                      ? "bg-emerald-100 text-emerald-800"
                      : decision === "rejected"
                      ? "bg-rose-100 text-rose-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {decision}
                </span>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Citations</p>
                  <ul className="mt-2 space-y-2">
                    {proposal.citations.map((citation, citationIndex) => (
                      <li key={`${citation.chunkId}-${citationIndex}`} className="rounded bg-white p-2 text-xs">
                        <p className="font-medium text-slate-800">
                          {documentTitleById[citation.documentId] || citation.documentId}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          chunk {citation.chunkId.slice(0, 8)} | version {citation.versionId.slice(0, 8)}
                        </p>
                        <p className="mt-1 italic text-slate-600">"{citation.snippet}"</p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Operations</p>
                  <ul className="mt-2 space-y-2">
                    {proposal.operations.map((operation, operationIndex) => (
                      <li key={`${proposalKey}-op-${operationIndex}`} className="rounded bg-white p-2 text-xs">
                        <p className="font-medium text-slate-800">{labelForOpType(operation.opType)}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          target: {documentTitleById[operation.target.documentId] || operation.target.documentId} /{" "}
                          {operation.target.chunkId.slice(0, 8)}
                        </p>
                        {operation.findText ? (
                          <p className="mt-1 text-slate-700">
                            <span className="font-medium">Find:</span> {operation.findText}
                          </p>
                        ) : null}
                        {operation.replaceText ? (
                          <p className="mt-1 text-slate-700">
                            <span className="font-medium">Replace:</span> {operation.replaceText}
                          </p>
                        ) : null}
                        {operation.insertText ? (
                          <p className="mt-1 text-slate-700">
                            <span className="font-medium">Insert:</span> {operation.insertText}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDecisions((current) => ({
                      ...current,
                      [proposalKey]: "approved",
                    }))
                  }
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDecisions((current) => ({
                      ...current,
                      [proposalKey]: "rejected",
                    }))
                  }
                  className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Modify later
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
