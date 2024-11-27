import { Handler } from '@netlify/functions';
import { validateWebhookRequest } from './webhook/utils/validate-webhook';
import { handleCheckoutCompleted } from './webhook/handlers/checkout';
import { handleSubscriptionUpdated, handleSubscriptionDeleted } from './webhook/handlers/subscription';
import { handleInvoicePaymentSucceeded, handleInvoicePaymentFailed } from './webhook/handlers/invoice';

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { 
      statusCode: 200, 
      headers 
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const signature = event.headers['stripe-signature'];
    const { event: stripeEvent, error } = await validateWebhookRequest(event.body!, signature);

    if (error) {
      return {
        statusCode: error.status || 400,
        headers,
        body: JSON.stringify({ error: error.message }),
      };
    }

    if (!stripeEvent) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No event constructed' }),
      };
    }

    console.log('Processing webhook event:', stripeEvent.type);

    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(stripeEvent.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(stripeEvent.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(stripeEvent.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(stripeEvent.data.object);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(stripeEvent.data.object);
        break;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true }),
    };
  } catch (err) {
    console.error('Error processing webhook:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: err instanceof Error ? err.message : 'Internal server error',
      }),
    };
  }
}