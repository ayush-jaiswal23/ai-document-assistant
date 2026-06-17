from django.db import migrations, models


def populate_collection_names(apps, schema_editor):
    GroupDocument = apps.get_model('api', 'GroupDocument')
    for document in GroupDocument.objects.all():
        document.chroma_collection_name = f'group-document-{document.group_id}'
        document.save(update_fields=['chroma_collection_name'])


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0003_groupdocument_embedding_model_user_company_name_and_more'),
    ]

    operations = [
        migrations.DeleteModel(
            name='DocumentChunk',
        ),
        migrations.AddField(
            model_name='groupdocument',
            name='chroma_collection_name',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='groupdocument',
            name='chunk_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='groupdocument',
            name='indexed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='groupdocument',
            name='indexing_error',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='groupdocument',
            name='indexing_status',
            field=models.CharField(
                choices=[('pending', 'Pending'), ('indexed', 'Indexed'), ('failed', 'Failed')],
                default='pending',
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name='groupdocument',
            name='source_mime_type',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='groupdocument',
            name='vector_store_backend',
            field=models.CharField(default='chroma', max_length=32),
        ),
        migrations.AlterField(
            model_name='groupdocument',
            name='embedding_model',
            field=models.CharField(default='gemini-embedding-001', max_length=64),
        ),
        migrations.RunPython(populate_collection_names, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='groupdocument',
            name='chroma_collection_name',
            field=models.CharField(max_length=255, unique=True),
        ),
    ]
