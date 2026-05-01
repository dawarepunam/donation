const getFinancialYear = (value) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  return month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

const estimateTaxSaving = (amount, deductionRate = 0.5, taxSlabRate = 0.3) => {
  return Math.round(amount * deductionRate * taxSlabRate);
};

const calculateYearlyDonation = (donations) => {
  return donations.reduce((acc, donation) => {
    const year = donation.financialYear || getFinancialYear(donation.date);
    acc[year] = (acc[year] || 0) + donation.amount;
    return acc;
  }, {});
};

const monthlyBreakdown = (donations) => {
  return donations.reduce((acc, donation) => {
    const monthKey = new Date(donation.date).toLocaleString("en-IN", {
      month: "short",
      year: "numeric",
    });
    acc[monthKey] = (acc[monthKey] || 0) + donation.amount;
    return acc;
  }, {});
};

module.exports = {
  getFinancialYear,
  estimateTaxSaving,
  calculateYearlyDonation,
  monthlyBreakdown,
};
