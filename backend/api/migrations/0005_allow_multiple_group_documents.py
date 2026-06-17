import django.db.models.deletion
from django.db import migrations, models


def populate_document_collection_names(apps, schema_editor):
    GroupDocument = apps.get_model('api', 'GroupDocument')
    for document in GroupDocument.objects.all():
        document.chroma_collection_name = f'group-document-{document.group_id}-{document.id}'
        document.save(update_fields=['chroma_collection_name'])


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0004_groupdocument_chroma_metadata'),
    ]

    operations = [
        migrations.AlterField(
            model_name='groupdocument',
            name='group',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='documents',
                to='api.group',
            ),
        ),
        migrations.RunPython(populate_document_collection_names, migrations.RunPython.noop),
    ]
