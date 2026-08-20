create unique index if not exists inventory_movements_sale_order_product_key
  on public.inventory_movements (order_id, product_id, movement_type)
  where order_id is not null
    and product_id is not null
    and movement_type = 'sale';

create or replace function public.apply_order_stock_sale(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item record;
  v_inserted integer;
  v_movements_created integer := 0;
  v_units_sold integer := 0;
begin
  select id, payment_status, order_status
    into v_order
    from public.orders
   where id = p_order_id;

  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;

  if v_order.order_status = 'cancelled'
     or v_order.payment_status not in ('paid', 'cod') then
    return jsonb_build_object(
      'ok', true,
      'applied', false,
      'reason', 'order_not_confirmed_for_sale',
      'order_id', p_order_id
    );
  end if;

  for v_item in
    select product_id, sum(quantity)::integer as quantity
      from public.order_items
     where order_id = p_order_id
       and product_id is not null
       and quantity > 0
     group by product_id
  loop
    insert into public.inventory_movements (
      product_id,
      order_id,
      movement_type,
      quantity,
      note,
      created_by
    )
    values (
      v_item.product_id,
      p_order_id,
      'sale',
      -v_item.quantity,
      'Order confirmed',
      'system'
    )
    on conflict do nothing;

    get diagnostics v_inserted = row_count;

    if v_inserted > 0 then
      update public.products
         set stock = greatest(coalesce(stock, 0) - v_item.quantity, 0),
             updated_at = now()
       where id = v_item.product_id;

      v_movements_created := v_movements_created + 1;
      v_units_sold := v_units_sold + v_item.quantity;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'applied', v_movements_created > 0,
    'order_id', p_order_id,
    'movements_created', v_movements_created,
    'units_sold', v_units_sold
  );
end;
$$;

revoke all on function public.apply_order_stock_sale(uuid) from public;
revoke all on function public.apply_order_stock_sale(uuid) from anon;
revoke all on function public.apply_order_stock_sale(uuid) from authenticated;
grant execute on function public.apply_order_stock_sale(uuid) to service_role;
