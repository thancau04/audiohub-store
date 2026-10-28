// Các hàm hỗ trợ (helper) dùng trong template Handlebars

const vnd = new Intl.NumberFormat('vi-VN');
const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

module.exports = {
  // 7490000 -> "7.490.000 ₫"
  formatPrice(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${vnd.format(n)} ₫` : '';
  },
  formatNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? vnd.format(n) : '';
  },
  formatDate(value) {
    return value ? dateFmt.format(new Date(value)) : '';
  },
  eq(a, b) {
    return a === b;
  },
  // Tồn kho thấp (<= 5) -> hiển thị cảnh báo
  isLowStock(stock) {
    return Number(stock) <= 5;
  },
  // Giá trị rỗng -> dấu gạch ngang
  orDash(value) {
    return value === null || value === undefined || value === '' ? '—' : value;
  },
};
