# Generated manually; equivalent to makemigrations billing.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='PaymentWebhookEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('provider', models.CharField(max_length=30)),
                ('provider_event_id', models.CharField(max_length=255)),
                ('event_type', models.CharField(max_length=100)),
                ('payload', models.JSONField(default=dict)),
                ('processed_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'constraints': [
                    models.UniqueConstraint(
                        fields=('provider', 'provider_event_id'),
                        name='unique_provider_webhook_event',
                    ),
                ],
            },
        ),
    ]
