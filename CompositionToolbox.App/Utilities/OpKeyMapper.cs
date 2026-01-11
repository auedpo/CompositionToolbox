// Purpose: Translates legacy op type strings into canonical OpKeys.

using System;
using System.Collections.Generic;

namespace CompositionToolbox.App.Utilities
{
    public static class OpKeyMapper
    {
        private static readonly Dictionary<string, string> LegacyMap = new(StringComparer.OrdinalIgnoreCase)
        {
            ["INPUT"] = OpKeys.ProjectInitInput,
            ["Input"] = OpKeys.ProjectInitInput,
            ["GapToPc"] = OpKeys.PitchGapToPcApply,
            ["Gap -> PC"] = OpKeys.PitchGapToPcApply,
            ["FocusAffine"] = OpKeys.TransformFocusAffineApply,
            ["ACDL"] = OpKeys.TransformAcdlApply,
            ["ACDL - Unique PCs"] = OpKeys.PitchPcsetDedupe,
            ["ACDL - Ordered from Unordered"] = OpKeys.PitchPcsetOrder,
            ["IVMove"] = OpKeys.PitchIvExplorerMove,
            ["IV Move"] = OpKeys.PitchIvExplorerMove,
            ["Necklace Entry"] = OpKeys.PitchNecklaceEnter,
            ["FORGET_ORDER"] = OpKeys.UiInspectorForgetOrder,
            ["Forget order"] = OpKeys.UiInspectorForgetOrder,
            ["CHOOSE_ORDERING"] = OpKeys.UiInspectorChooseOrdering,
            ["Choose ordering"] = OpKeys.UiInspectorChooseOrdering
        };

        public static string? FromLegacyOpType(string? opType)
        {
            if (string.IsNullOrWhiteSpace(opType))
            {
                return null;
            }

            return LegacyMap.TryGetValue(opType.Trim(), out var key)
                ? key
                : null;
        }
    }
}
