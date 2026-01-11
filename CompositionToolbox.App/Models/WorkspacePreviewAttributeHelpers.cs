// Purpose: Domain model that represents the Workspace Preview Attribute Helpers data used across the application.

using System.Collections.Generic;

namespace CompositionToolbox.App.Models
{
    public static class WorkspacePreviewAttributeHelpers
    {
        public static IReadOnlyList<WorkspacePreviewAttribute> BuildPcAttributes(
            int[] pcs,
            int modulus,
            string? label = null,
            string? lensName = null)
        {
            var list = new List<WorkspacePreviewAttribute>
            {
                new WorkspacePreviewAttribute("PCs", $"({string.Join(' ', pcs)})"),
                new WorkspacePreviewAttribute("Count", pcs.Length.ToString())
            };

            if (!string.IsNullOrWhiteSpace(lensName))
            {
                list.Insert(0, new WorkspacePreviewAttribute("Lens", lensName));
            }

            if (!string.IsNullOrWhiteSpace(label))
            {
                list.Insert(0, new WorkspacePreviewAttribute("Label", label));
            }

            return list;
        }
    }
}
