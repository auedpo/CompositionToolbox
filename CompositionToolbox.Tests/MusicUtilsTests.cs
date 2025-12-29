using CompositionToolbox.App.Models;

namespace CompositionToolbox.Tests;

public class MusicUtilsTests
{
    [Fact]
    public void NormalOrder_RespectsRahnTieBreak()
    {
        var pcs = new[] { 0, 1, 2, 7 };
        var result = MusicUtils.ComputeNormalOrder(pcs, 12);
        Assert.Equal(new[] { 0, 5, 6, 7 }, result);
    }

    [Fact]
    public void NormalOrder_DeterministicForSymmetricSet()
    {
        var pcs = new[] { 0, 3, 6, 9 };
        var result = MusicUtils.ComputeNormalOrder(pcs, 12);
        Assert.Equal(new[] { 0, 3, 6, 9 }, result);
    }

    [Fact]
    public void PrimeForm_UsesPackedLeftComparison()
    {
        var pcs = new[] { 0, 1, 4, 7 };
        var result = MusicUtils.ComputePrimeForm(pcs, 12);
        // Under packed-left comparison, among all transposition/inversion candidates for [0,1,4,7],
        // [0,3,6,7] is selected as the prime form because its intervals are maximally packed to the left.
        Assert.Equal(new[] { 0, 3, 6, 7 }, result);
    }
}
