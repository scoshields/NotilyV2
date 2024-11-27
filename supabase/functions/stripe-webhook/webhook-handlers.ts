import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.17.0'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  }
)

export async function handleWebhookEvent(event: Stripe.Event) {
  console.log(`Processing webhook event: ${event.type}`)

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
      break
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
      break
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
      break
    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
      break
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
      break
    default:
      console.log(`Unhandled event type: ${event.type}`)
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.supabase_user_id
  if (!userId) throw new Error('No user ID in session metadata')

  const { error } = await supabaseAdmin
    .from('users')
    .update({
      subscription_status: 'active',
      subscription_period: session.mode === 'subscription' ? 'monthly' : 'annual',
      stripe_subscription_id: session.subscription,
      stripe_customer_id: session.customer,
      subscription_start_date: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', userId)

  if (error) throw error
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const { data: users, error: selectError } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('stripe_subscription_id', subscription.id)

  if (selectError) throw selectError
  if (!users?.length) return

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      subscription_status: subscription.status,
      subscription_end_date: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', users[0].id)

  if (updateError) throw updateError
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const { data: users, error: selectError } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('stripe_subscription_id', subscription.id)

  if (selectError) throw selectError
  if (!users?.length) return

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      subscription_status: 'cancelled',
      subscription_end_date: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', users[0].id)

  if (updateError) throw updateError
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return

  const { data: users, error: selectError } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('stripe_subscription_id', invoice.subscription)

  if (selectError) throw selectError
  if (!users?.length) return

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      subscription_status: 'active',
      updated_at: new Date().toISOString()
    })
    .eq('id', users[0].id)

  if (updateError) throw updateError
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return

  const { data: users, error: selectError } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('stripe_subscription_id', invoice.subscription)

  if (selectError) throw selectError
  if (!users?.length) return

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      subscription_status: 'past_due',
      updated_at: new Date().toISOString()
    })
    .eq('id', users[0].id)

  if (updateError) throw updateError
}