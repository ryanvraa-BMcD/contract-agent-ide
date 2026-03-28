import { Mark, mergeAttributes } from "@tiptap/core";

export interface TrackInsertionOptions {
  HTMLAttributes: Record<string, string>;
}

export const TrackInsertion = Mark.create<TrackInsertionOptions>({
  name: "trackInsertion",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      proposalId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-proposal-id"),
        renderHTML: (attributes) => ({
          "data-proposal-id": attributes.proposalId as string,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "ins[data-track]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "ins",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-track": "",
        style:
          "background-color: #dcfce7; text-decoration: none; border-bottom: 2px solid #22c55e; cursor: pointer;",
      }),
      0,
    ];
  },
});

export interface TrackDeletionOptions {
  HTMLAttributes: Record<string, string>;
}

export const TrackDeletion = Mark.create<TrackDeletionOptions>({
  name: "trackDeletion",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      proposalId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-proposal-id"),
        renderHTML: (attributes) => ({
          "data-proposal-id": attributes.proposalId as string,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "del[data-track]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "del",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-track": "",
        style:
          "background-color: #fef2f2; text-decoration: line-through; color: #ef4444; cursor: pointer;",
      }),
      0,
    ];
  },
});
