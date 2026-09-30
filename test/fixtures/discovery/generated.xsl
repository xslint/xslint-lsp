<?xml version="1.0"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:ledger="urn:ledger" version="2.0">
  <xsl:template match="entry">
    <xsl:if test="'true'">
      <xsl:value-of select="ledger:farewell()"/>
    </xsl:if>
  </xsl:template>
</xsl:stylesheet>
