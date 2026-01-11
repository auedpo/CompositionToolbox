// Purpose: Core code file related to Focus Affine Tests.

using System.Linq;
using CompositionToolbox.App.Services;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.Tests;

public class FocusAffineTests
{
    [Fact]
    public void FocusAffine_Mod12_A5_F0()
    {
        var set = new[] { 0, 2, 4, 5 };
        var result = FocusAffineMath.ComputeFocusAffine(set, 12, 5, 0);
        Assert.Equal(new[] { 0, 1, 8, 10 }, result);
    }

    [Fact]
    public void FocusAffine_Mod12_A5_F2()
    {
        var set = new[] { 0, 2, 4, 5 };
        var result = FocusAffineMath.ComputeFocusAffine(set, 12, 5, 2);
        Assert.Equal(new[] { 6, 8, 10, 11 }, result);
    }

    [Fact]
    public void FocusAffine_Mod12_A2_ParityLock()
    {
        var set = new[] { 0, 2, 4, 5 };
        var result = FocusAffineMath.ComputeFocusAffine(set, 12, 2, 4);
        Assert.All(result, pc => Assert.Equal(0, pc % 2));
    }

    [Fact]
    public void FocusAffine_IsBijective()
    {
        Assert.True(FocusAffineMath.IsBijective(5, 12));
        Assert.False(FocusAffineMath.IsBijective(2, 12));
    }

    [Fact]
    public void IntervalVector_SizeMatchesPairs()
    {
        var pcs = new[] { 0, 2, 4, 5 };
        var iv = IntervalVectorIndexService.ComputeIntervalVector(pcs, 12);
        var expectedPairs = pcs.Length * (pcs.Length - 1) / 2;
        Assert.Equal(expectedPairs, iv.Sum());
    }
}
