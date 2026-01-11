// Purpose: Contract for services that produce note realizations.

using System.Collections.Generic;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Services
{
    public interface INoteRealizer
    {
        IReadOnlyList<RealizedNote> Realize(CompositeSnapshot snap);
    }
}
