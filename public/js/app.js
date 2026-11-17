// Xử lý xác nhận thao tác nguy hiểm (thay cho inline onsubmit để tương thích CSP của Helmet)
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const msg = form.getAttribute('data-confirm');
  if (msg && !window.confirm(msg)) {
    event.preventDefault();
  }
});

// Thêm / xóa dòng sản phẩm và tự tính tổng tiền ở trang Tạo đơn hàng
(function initOrderForm() {
  const container = document.getElementById('order-items');
  const addBtn = document.getElementById('add-order-row');
  const totalEl = document.getElementById('order-preview-total');
  if (!container || !addBtn) return;

  const fmt = new Intl.NumberFormat('vi-VN');

  function updateTotal() {
    let sum = 0;
    container.querySelectorAll('.order-row').forEach((row) => {
      const sel = row.querySelector('select[name="product_id"]');
      const qtyInput = row.querySelector('input[name="quantity"]');
      if (!sel || !qtyInput) return;
      const opt = sel.options[sel.selectedIndex];
      const price = opt ? Number(opt.getAttribute('data-price') || 0) : 0;
      const qty = Math.max(0, Number(qtyInput.value || 0));
      sum += price * qty;
    });
    if (totalEl) totalEl.textContent = `${fmt.format(sum)} ₫`;
  }

  addBtn.addEventListener('click', () => {
    const first = container.querySelector('.order-row');
    if (!first) return;
    const clone = first.cloneNode(true);
    const sel = clone.querySelector('select');
    const qty = clone.querySelector('input[name="quantity"]');
    if (sel) sel.selectedIndex = 0;
    if (qty) qty.value = '1';
    container.appendChild(clone);
    updateTotal();
  });

  container.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-remove-row]');
    if (!btn) return;
    const rows = container.querySelectorAll('.order-row');
    if (rows.length <= 1) return;
    btn.closest('.order-row').remove();
    updateTotal();
  });

  container.addEventListener('change', updateTotal);
  container.addEventListener('input', updateTotal);
  updateTotal();
})();

// Xem trước ảnh khi chọn file tải lên Cloudinary
(function initImagePreview() {
  const fileInput = document.getElementById('image_file');
  const preview = document.getElementById('image-preview');
  if (!fileInput || !preview) return;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    preview.src = url;
    preview.hidden = false;
  });
})();
