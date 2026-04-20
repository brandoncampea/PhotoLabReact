import React, { useState } from 'react';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { ShippingAddress } from '../types';

interface StripePaymentFormProps {
  shippingAddress: ShippingAddress;
  onSuccess: (paymentIntentId: string) => Promise<void> | void;
  onCancel: () => void;
}

const StripePaymentForm: React.FC<StripePaymentFormProps> = ({
  shippingAddress,
  onSuccess,
  onCancel,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      setErrorMessage('Stripe is still loading. Please try again in a moment.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: {
        payment_method_data: {
          billing_details: {
            name: shippingAddress.fullName,
            email: shippingAddress.email,
            phone: shippingAddress.phone || undefined,
            address: {
              line1: shippingAddress.addressLine1,
              line2: shippingAddress.addressLine2 || undefined,
              city: shippingAddress.city,
              state: shippingAddress.state,
              postal_code: shippingAddress.zipCode,
              country: shippingAddress.country,
            },
          },
        },
      },
    });

    if (error) {
      setErrorMessage(`Stripe error: ${error.message || JSON.stringify(error)}`);
      setSubmitting(false);
      return;
    }

    if (!paymentIntent?.id) {
      setErrorMessage('Payment confirmation did not return a payment intent.');
      setSubmitting(false);
      return;
    }

    if (paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'processing') {
      setErrorMessage(`Payment status is ${paymentIntent.status}. Please try again.`);
      setSubmitting(false);
      return;
    }

    try {
      await onSuccess(paymentIntent.id);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Payment succeeded, but order finalization failed.');
      setSubmitting(false);
      return;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="stripe-payment-form">
      <div className="stripe-payment-element-wrap">
        <PaymentElement />
      </div>

      {errorMessage && <div className="stripe-payment-error">{errorMessage}</div>}

      <div className="stripe-payment-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!stripe || !elements || submitting}>
          {submitting ? 'Processing Payment...' : 'Pay Now'}
        </button>
      </div>
    </form>
  );
};

export default StripePaymentForm;
